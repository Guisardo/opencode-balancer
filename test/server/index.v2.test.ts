import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	getActiveAccount,
	saveAccount,
	setActiveAccount,
	setSelectedModel,
} from "../../src/core/accounts";
import {
	closeBalancerDatabase,
	openBalancerDatabase,
} from "../../src/core/database";
import { setBalancingEnabled, setProviderModel } from "../../src/core/priority";
import { migrate } from "../../src/core/schema";
import type { AuthInfo } from "../../src/core/types";
import { createServerHooksV2 } from "../../src/server/index.v2";
import {
	__testClearPendingRequests,
	__testGetPendingRequest,
	INTERNAL_REQUEST_HEADER,
} from "../../src/server/request-balancer";

let dirs: string[] = [];
let paths: string[] = [];

function db() {
	const dir = mkdtempSync(join(tmpdir(), "opencode-balancer-v2-"));
	dirs.push(dir);
	const path = join(dir, "balancer.sqlite");
	paths.push(path);
	const database = openBalancerDatabase(path);
	migrate(database);
	return database;
}

function cleanup() {
	__testClearPendingRequests();
	delete Bun.env.OPENCODE_AUTH_CONTENT;
	for (const path of paths) {
		try {
			closeBalancerDatabase(path);
		} catch {}
	}
	for (const dir of dirs) {
		for (let i = 0; i < 3; i++) {
			try {
				rmSync(dir, { force: true, recursive: true });
				break;
			} catch {}
		}
	}
	dirs = [];
	paths = [];
}

afterEach(() => {
	cleanup();
});

function createMockV2Context(_db: ReturnType<typeof openBalancerDatabase>) {
	const disposes: Array<() => void | Promise<void>> = [];
	const sessionHooks: Map<string, any> = new Map();
	const commandEditors: any[] = [];
	const toolEditors: any[] = [];

	return {
		__testCommandEditors: commandEditors,
		// Test helpers
		__testSessionHooks: sessionHooks,
		__testToolEditors: toolEditors,
		client: {},
		command: {
			transform: async (editor: any) => {
				commandEditors.push(editor);
				disposes.push(() => {});
				return { dispose: () => {} };
			},
		},
		dispose: () => {
			for (const dispose of disposes) dispose();
		},
		permission: {
			set: async (_input?: unknown) => {},
		},
		session: {
			hook: async (name: string, handler: any) => {
				sessionHooks.set(name, handler);
				disposes.push(() => {});
				return { dispose: () => {} };
			},
		},
		tool: {
			transform: async (editor: any) => {
				toolEditors.push(editor);
				disposes.push(() => {});
				return { dispose: () => {} };
			},
		},
	};
}

describe("v2 server plugin hooks", () => {
	test("creates all v2 server hooks", async () => {
		const database = db();
		const ctx = createMockV2Context(database);
		const hooks = await createServerHooksV2(ctx, database);

		expect(hooks.modelRequest).toBeFunction();
		expect(hooks.context).toBeFunction();
		expect(hooks.commandTransform).toBeFunction();
		expect(hooks.toolTransform).toBeFunction();
		expect(hooks.dispose).toBeFunction();
	});

	test("modelRequest marks requests for active accounts", async () => {
		const database = db();
		saveAccount(database, "openai", "main", { key: "sk-main", type: "api" });
		const ctx = createMockV2Context(database);
		const hooks = await createServerHooksV2(ctx, database);

		const event = {
			agent: "build",
			headers: {} as Record<string, string>,
			kind: "primary" as const,
			model: { id: "gpt-4", providerID: "openai" },
			sessionID: "ses-1",
		};

		await hooks.modelRequest(event);

		const requestID = event.headers[INTERNAL_REQUEST_HEADER];
		expect(requestID).toBeString();
		expect(__testGetPendingRequest(requestID)?.account?.alias).toBe("main");
	});

	test("modelRequest sets permission for oauth accounts (v2 behavior)", async () => {
		const database = db();
		const active = {
			access: "active-access",
			expires: Date.now() + 60_000,
			refresh: "active-refresh",
			type: "oauth",
		} satisfies AuthInfo;
		saveAccount(database, "openai", "active", active);
		const permissionSetCalls: unknown[] = [];
		const ctx = createMockV2Context(database);
		ctx.permission = {
			set: async (input: unknown) => {
				permissionSetCalls.push(input);
				return undefined;
			},
		};
		const hooks = await createServerHooksV2(ctx, database);

		const event = {
			agent: "build",
			headers: {} as Record<string, string>,
			kind: "primary" as const,
			model: { id: "gpt-4", providerID: "openai" },
			sessionID: "ses-1",
		};

		await hooks.modelRequest(event);

		expect(permissionSetCalls).toHaveLength(1);
		expect(permissionSetCalls[0]).toMatchObject({
			auth: { type: "oauth" },
			providerID: "openai",
		});
		expect(event.headers[INTERNAL_REQUEST_HEADER]).toBeString();
	});

	test("context hook fills the selected provider model when balancing is off", async () => {
		const database = db();
		saveAccount(database, "github-copilot", "gh1", {
			access: "access",
			expires: Date.now() + 1000,
			refresh: "refresh",
			type: "oauth",
		});
		setActiveAccount(database, "github-copilot", "gh1");
		setSelectedModel(database, "github-copilot", "claude-haiku-4.5");
		const ctx = createMockV2Context(database);
		const hooks = await createServerHooksV2(ctx, database);

		const event = {
			agent: "build",
			model: undefined as { providerID: string; id: string } | undefined,
			options: {
				model: undefined as { providerID: string; id: string } | undefined,
			},
			sessionID: "ses-1",
		};

		await hooks.context(event);

		expect(event.options.model).toEqual({
			id: "claude-haiku-4.5",
			providerID: "github-copilot",
		});
	});

	test("context hook preserves opencode's native selected model", async () => {
		const database = db();
		saveAccount(database, "github-copilot", "gh1", {
			access: "access",
			expires: Date.now() + 1000,
			refresh: "refresh",
			type: "oauth",
		});
		setActiveAccount(database, "github-copilot", "gh1");
		setSelectedModel(database, "github-copilot", "claude-haiku-4.5");
		const ctx = createMockV2Context(database);
		const hooks = await createServerHooksV2(ctx, database);

		const event = {
			agent: "build",
			model: { id: "gpt-5.5", providerID: "openai" },
			options: { model: { id: "gpt-5.5", providerID: "openai" } },
			sessionID: "ses-1",
		};

		await hooks.context(event);

		expect(event.options.model).toEqual({
			id: "gpt-5.5",
			providerID: "openai",
		});
	});

	test("context hook keeps the current provider when balancing can select a healthy account there", async () => {
		const database = db();
		saveAccount(database, "github-copilot", "gh1", {
			access: "access",
			expires: Date.now() + 1000,
			refresh: "refresh",
			type: "oauth",
		});
		saveAccount(database, "openai", "op1", { key: "sk", type: "api" });
		setProviderModel(database, "github-copilot", "gemini-2.5-pro");
		setProviderModel(database, "openai", "gpt-5.5");
		setBalancingEnabled(database, true);
		const ctx = createMockV2Context(database);
		const hooks = await createServerHooksV2(ctx, database);

		const event = {
			agent: "build",
			model: { id: "gpt-5.5", providerID: "openai" },
			options: { model: { id: "gpt-5.5", providerID: "openai" } },
			sessionID: "ses-1",
		};

		await hooks.context(event);

		expect(event.options.model).toEqual({
			id: "gpt-5.5",
			providerID: "openai",
		});
		expect(getActiveAccount(database, "openai")?.alias).toBe("op1");
	});

	test("context hook falls over to the next provider when the top one is rate limited (balancing on)", async () => {
		const database = db();
		saveAccount(database, "github-copilot", "gh1", {
			access: "access",
			expires: Date.now() + 1000,
			refresh: "refresh",
			type: "oauth",
		});
		saveAccount(database, "openai", "op1", { key: "sk", type: "api" });
		setProviderModel(database, "github-copilot", "gemini-2.5-pro");
		setProviderModel(database, "openai", "gpt-5.5");
		setBalancingEnabled(database, true);
		database
			.query(
				"UPDATE accounts SET rate_limited_until = ? WHERE provider_id = 'github-copilot'",
			)
			.run(Date.now() + 60_000);
		const ctx = createMockV2Context(database);
		const hooks = await createServerHooksV2(ctx, database);

		const event = {
			agent: "build",
			model: undefined as { providerID: string; id: string } | undefined,
			options: {
				model: undefined as { providerID: string; id: string } | undefined,
			},
			sessionID: "ses-1",
		};

		await hooks.context(event);

		expect(event.options.model).toEqual({
			id: "gpt-5.5",
			providerID: "openai",
		});
	});

	test("commandTransform registers balancer command", async () => {
		const database = db();
		const ctx = createMockV2Context(database);
		const hooks = await createServerHooksV2(ctx, database);

		const commands: any[] = [];
		const editor = {
			add: (cmd: any) => commands.push(cmd),
		};

		hooks.commandTransform(editor);

		const balancerCmd = commands.find((c) => c.name === "balancer");
		expect(balancerCmd).toBeDefined();
		expect(balancerCmd.description).toBe(
			"Run fallback account balancer commands",
		);
		expect(balancerCmd.execute).toBeFunction();
	});

	test("toolTransform registers balancer_command tool", async () => {
		const database = db();
		const ctx = createMockV2Context(database);
		const hooks = await createServerHooksV2(ctx, database);

		const tools: any[] = [];
		const editor = {
			add: (tool: any) => tools.push(tool),
		};

		hooks.toolTransform(editor);

		const balancerTool = tools.find((t) => t.name === "balancer_command");
		expect(balancerTool).toBeDefined();
		expect(balancerTool.description).toBe(
			"Run fallback account balancer commands",
		);
		expect(balancerTool.execute).toBeFunction();
	});
});
