import type { Database } from "bun:sqlite";
import type { TuiPlugin } from "@opencode-ai/plugin/tui";
import { Plugin as PluginV2 } from "@opencode/plugin";
import packageJson from "../package.json" with { type: "json" };
import {
	type Config,
	type Hooks,
	type Plugin,
	tool,
} from "@opencode-ai/plugin";
import {
	getActiveAccount,
	getSelectedAccount,
	getSelectedModel,
	setActiveAccount,
} from "./core/accounts";
import { openBalancerDatabase } from "./core/database";
import { storePath } from "./core/path";
import { getBalancingEnabled, resolveActiveSelection } from "./core/priority";
import { migrate } from "./core/schema";
import { checkAndInvalidateOutdatedPackageCache } from "./server/cache-update";
import { runFallbackBalancerCommand } from "./server/commands";
import { installFetchPatch } from "./server/fetch-patch";
import { setNativeAuth, showToast } from "./server/native";
import {
	BALANCER_METADATA_KEY,
	INTERNAL_REQUEST_HEADER,
	setPendingRequest,
} from "./server/request-balancer";

const PACKAGE_NAME = "@thelioo/opencode-balancer";

function configureFallbackCommand(cfg: Config) {
	if (!cfg.command?.balancer) return;
}

function runSafeFallbackBalancerCommand(db: Database, raw: string) {
	try {
		return runFallbackBalancerCommand(db, raw);
	} catch (error) {
		return error instanceof Error ? error.message : "Balancer command failed.";
	}
}

// v1 server hooks
function createServerHooksV1({
	cacheUpdate,
	db,
	client,
}: {
	cacheUpdate?: () => Promise<unknown>;
	db: Database;
	client: any;
}): Hooks {
	cacheUpdate?.().catch(() => {});

	return {
		"chat.headers": async (input, output) => {
			const providerID = input.model.providerID;
			const account = getActiveAccount(db, providerID);
			if (!account) return;

			if (account.auth.type === "oauth") {
				await setNativeAuth(client, providerID, account.auth, db);
			}

			const requestID = crypto.randomUUID();
			setPendingRequest(requestID, { account, providerID });
			output.headers[INTERNAL_REQUEST_HEADER] = requestID;
		},

		"chat.message": async (_input, output) => {
			if (getBalancingEnabled(db)) {
				const selection = resolveActiveSelection(
					db,
					undefined,
					output.message.model?.providerID,
				);
				if (!selection) return;
				setActiveAccount(db, selection.providerID, selection.account.alias);
				output.message.model = {
					modelID: selection.modelID,
					providerID: selection.providerID,
				};
				return;
			}

			if (output.message.model?.providerID && output.message.model?.modelID)
				return;

			const selected = getSelectedAccount(db);
			if (!selected) return;
			const model = getSelectedModel(db, selected.providerID);
			if (!model) return;

			output.message.model = {
				modelID: model.modelID,
				providerID: model.providerID,
			};
		},

		"command.execute.before": async (input, output) => {
			if (input.command !== "balancer") return;
			const result = runSafeFallbackBalancerCommand(db, input.arguments);
			output.parts.length = 0;
			await showToast(client, result.split("\n")[0] ?? result, "info");
			throw new Error(`[balancer]\n${result}`);
		},
		config: async (cfg) => {
			configureFallbackCommand(cfg);
		},
		"experimental.chat.messages.transform": async (_input, output) => {
			output.messages = output.messages.filter((message) => {
				return !message.parts.some((part: any) => {
					return part?.metadata?.[BALANCER_METADATA_KEY] === true;
				});
			});
		},

		tool: {
			balancer_command: tool({
				args: {
					command: tool.schema
						.string()
						.describe("Command arguments for /balancer."),
				},
				description: "Run fallback account balancer commands.",
				execute: async (args) =>
					runSafeFallbackBalancerCommand(db, args.command),
			}),
		},
	};
}

// v1 server plugin entrypoint
export const server = (async ({ client }) => {
	const db = openBalancerDatabase(storePath());
	migrate(db);
	installFetchPatch(db, client);

	return createServerHooksV1({
		cacheUpdate: () =>
			checkAndInvalidateOutdatedPackageCache({
				currentVersion: packageJson.version,
				moduleUrl: import.meta.url,
				packageName: PACKAGE_NAME,
			}),
		client,
		db,
	});
}) satisfies Plugin;

// v2 server hooks (inline to avoid circular deps)
interface SessionModelRequest {
	readonly agent: string;
	baseURL?: string;
	headers: Record<string, string>;
	readonly kind: "primary" | "compaction" | "title" | "generate";
	readonly model: { providerID: string; id: string };
	readonly sessionID: string;
}

interface SessionContext {
	readonly agent: string;
	readonly model: { providerID: string; id: string } | undefined;
	readonly options: {
		model?: { providerID: string; id: string } | undefined;
	} & Record<string, unknown>;
	readonly sessionID: string;
}

interface V2ServerHooks {
	commandTransform: (editor: any) => void;
	context: (event: SessionContext) => Promise<void> | void;
	dispose?: () => void;
	modelRequest: (event: SessionModelRequest) => Promise<void> | void;
	toolTransform: (editor: any) => void;
}

async function createServerHooksV2(
	ctx: any,
	db?: ReturnType<typeof openBalancerDatabase>,
): Promise<V2ServerHooks> {
	const database = db ?? openBalancerDatabase(storePath());
	migrate(database);
	installFetchPatch(database, ctx.client);

	const cacheUpdate = () =>
		checkAndInvalidateOutdatedPackageCache({
			currentVersion: packageJson.version,
			moduleUrl: import.meta.url,
			packageName: PACKAGE_NAME,
		});

	cacheUpdate().catch(() => {});

	const modelRequest = async (event: SessionModelRequest) => {
		const providerID = event.model.providerID;
		const account = getActiveAccount(database, providerID);
		if (!account) return;

		if (account.auth.type === "oauth") {
			try {
				await ctx.permission?.set?.({ auth: account.auth, providerID });
			} catch {
				await ctx.client?.auth?.set?.({
					body: account.auth,
					path: { id: providerID },
				});
			}
		}

		const requestID = crypto.randomUUID();
		setPendingRequest(requestID, { account, providerID });
		event.headers[INTERNAL_REQUEST_HEADER] = requestID;
	};

	const contextHook = async (event: SessionContext) => {
		if (getBalancingEnabled(database)) {
			const selection = resolveActiveSelection(
				database,
				undefined,
				event.options.model?.providerID,
			);
			if (!selection) return;
			setActiveAccount(database, selection.providerID, selection.account.alias);
			event.options.model = {
				id: selection.modelID,
				providerID: selection.providerID,
			};
			return;
		}

		if (event.options.model?.providerID && event.options.model?.id) return;

		const selected = getSelectedAccount(database);
		if (!selected) return;
		const model = getSelectedModel(database, selected.providerID);
		if (!model) return;

		event.options.model = {
			id: model.modelID,
			providerID: model.providerID,
		};
	};

	const commandTransform = (editor: any) => {
		editor.add({
			description: "Run fallback account balancer commands",
			execute: async ({ sessionID: _sessionID, prompt }: any) => {
				const result = runFallbackBalancerCommand(database, prompt);
				throw new Error(`[balancer]\n${result}`);
			},
			name: "balancer",
		});
	};

	const toolTransform = (editor: any) => {
		editor.add({
			description: "Run fallback account balancer commands",
			execute: async (input: any) =>
				runFallbackBalancerCommand(database, input.command),
			input: {
				additionalProperties: false,
				properties: {
					command: {
						description: "Command arguments for /balancer",
						type: "string",
					},
				},
				required: ["command"],
				type: "object",
			},
			name: "balancer_command",
		});
	};

	const dispose = () => {
		// Cleanup if needed
	};

	return {
		commandTransform,
		context: contextHook,
		dispose,
		modelRequest,
		toolTransform,
	};
}

// v2 plugin entrypoint
export default PluginV2.define({
	id: "opencode-balancer",
	async setup(ctx: PluginV2.Context) {
		const hooks = await createServerHooksV2(ctx);

		const modelRequestReg = await ctx.session.hook(
			"model.request",
			hooks.modelRequest,
		);
		const contextReg = await ctx.session.hook("context", hooks.context);
		const commandReg = await ctx.command.transform(hooks.commandTransform);
		const toolReg = await ctx.tool.transform(hooks.toolTransform);

		return () => {
			modelRequestReg.dispose();
			contextReg.dispose();
			commandReg.dispose();
			toolReg.dispose();
			hooks.dispose?.();
		};
	},
});

// v1 TUI plugin (lazy loaded)
const plugin = {
	id: "opencode-balancer",
	tui: async (api: any, options?: any, meta?: any) => {
		const module = (await import(
			new URL("./tui/tui.js", import.meta.url).href
		)) as {
			default: { tui: TuiPlugin };
		};
		return module.default.tui(api, options, meta);
	},
};

// Attach v1 exports to the default export for backward compatibility
Object.assign(plugin, { server });
export { plugin };