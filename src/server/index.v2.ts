import packageJson from "../../package.json" with { type: "json" };
import {
	getActiveAccount,
	getSelectedAccount,
	getSelectedModel,
	setActiveAccount,
} from "../core/accounts";
import { openBalancerDatabase } from "../core/database";
import { storePath } from "../core/path";
import { getBalancingEnabled, resolveActiveSelection } from "../core/priority";
import { migrate } from "../core/schema";
import { checkAndInvalidateOutdatedPackageCache } from "./cache-update";
import { runFallbackBalancerCommand } from "./commands";
import { installFetchPatch } from "./fetch-patch";
import { INTERNAL_REQUEST_HEADER, setPendingRequest } from "./request-balancer";

const PACKAGE_NAME = "@thelioo/opencode-balancer";

// Local type definitions for v2 session hooks (avoiding internal import path issues)
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

export interface V2ServerHooks {
	commandTransform: (editor: any) => void;
	context: (event: SessionContext) => Promise<void> | void;
	dispose?: () => void;
	modelRequest: (event: SessionModelRequest) => Promise<void> | void;
	toolTransform: (editor: any) => void;
}

export async function createServerHooksV2(
	ctx: any,
	db?: ReturnType<typeof openBalancerDatabase>,
): Promise<V2ServerHooks> {
	const database = db ?? openBalancerDatabase(storePath());
	migrate(database);
	installFetchPatch(database, ctx.client);

	// Cache update check (same as v1)
	const cacheUpdate = () =>
		checkAndInvalidateOutdatedPackageCache({
			currentVersion: packageJson.version,
			moduleUrl: import.meta.url,
			packageName: PACKAGE_NAME,
		});

	cacheUpdate().catch(() => {});

	// Shared logic from v1, adapted for v2 hook signatures
	const modelRequest = async (event: SessionModelRequest) => {
		const providerID = event.model.providerID;
		const account = getActiveAccount(database, providerID);
		if (!account) return;

		if (account.auth.type === "oauth") {
			// In v2, auth is managed by the host. Try to use permission domain if available.
			try {
				await ctx.permission?.set?.({ auth: account.auth, providerID });
			} catch {
				// Fallback to client if available
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
		// Balancing on: the priority list decides the provider/model for every message
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

		// Balancing off: keep opencode's native choice; only fill when missing
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
				// In v2, toasts are shown from TUI plugin, not server
				// await showToast(ctx.client, result.split("\n")[0] ?? result, "info");
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
