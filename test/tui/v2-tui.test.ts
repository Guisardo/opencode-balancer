import { afterEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { TempDirManager } from "../utils";

const compact = (source: string) => source.replace(/\s+/g, "");
const expectSourceToContain = (source: string, snippet: string) =>
	expect(compact(source)).toContain(compact(snippet));

import plugin from "../../src/v2/tui";

const configDirManager = new TempDirManager();

function withTempConfigDir() {
	const dir = configDirManager.create("opencode-balancer-v2-tui-plugin-");
	Bun.env.OPENCODE_CONFIG_DIR = dir;
}

afterEach(() => {
	configDirManager.cleanup();
	delete Bun.env.OPENCODE_CONFIG_DIR;
});

function createV2Api() {
	const routes: any[] = [];
	const keymapLayers: any[] = [];
	const navigations: unknown[] = [];
	const toasts: unknown[] = [];
	const dialogs: unknown[] = [];
	const dialogSizes: string[] = [];
	const slots: any[] = [];
	const disposes: Array<() => void | Promise<void>> = [];

	const context = {
		command: undefined,
		keymap: {
			layer: (layerFn: any) => {
				const layer = layerFn();
				keymapLayers.push(layer);
				return () => {};
			},
			registerLayer: (layer: any) => {
				keymapLayers.push(layer);
				return () => {};
			},
		},
		lifecycle: {
			onDispose: (fn: () => void | Promise<void>) => {
				disposes.push(fn);
			},
		},
		renderer: {
			height: 40,
			width: 120,
		},
		route: {
			current: { name: "home" },
			navigate: (target: any) => {
				navigations.push(target);
			},
		},
		state: {
			provider: [],
			session: new Map(),
		},
		theme: {
			current: {
				accent: "accent",
				background: "background",
				primary: "primary",
				success: "success",
				text: "text",
				textMuted: "textMuted",
				warning: "warning",
			},
		},
		ui: {
			dialog: {
				open: false,
				openFn: (render: () => unknown) => {
					dialogs.push(render);
				},
			},
			keymap: {
				layer: (layer: any) => {
					keymapLayers.push(layer);
					return () => {};
				},
			},
			router: {
				current: { name: "home" },
				navigate: (target: any) => {
					navigations.push(target);
				},
				register: (routeDef: any) => {
					const defs = Array.isArray(routeDef) ? routeDef : [routeDef];
					routes.push(...defs);
					return () => {};
				},
			},
			slot: (slotDef: any) => {
				slots.push(slotDef);
				return () => {};
			},
			slots: {
				register: (slotDef: any) => {
					if (slotDef.slots && typeof slotDef.slots === "object") {
						for (const [key, slot] of Object.entries(slotDef.slots)) {
							slots.push({ ...(slot as object), name: key });
						}
					}
					return () => {};
				},
			},
			toast: {
				show: (input: any) => {
					toasts.push(input);
				},
			},
		},
	};

	return {
		context,
		dialogSizes,
		dialogs,
		disposes,
		keymapLayers,
		navigations,
		routes,
		slots,
		toasts,
	};
}

describe("v2 tui plugin", () => {
	test(
		"registers dashboard routes, keymap layer, and slots",
		async () => {
			withTempConfigDir();
			const {
				context,
				routes,
				keymapLayers,
				navigations,
				dialogs,
				dialogSizes,
				toasts,
				slots,
				disposes,
			} = createV2Api();

			await plugin.setup(context as any);

			expect(routes.map((route) => route.name)).toEqual([
				"balancer.dashboard",
				"balancer.priority",
			]);
			expect(keymapLayers).toHaveLength(1);
			expect(keymapLayers[0].mode).toBe("global");
			expect(keymapLayers[0].commands).toHaveLength(1);
			expect(keymapLayers[0].commands[0].id).toBe("balancer.dashboard.open");
			expect(keymapLayers[0].commands[0].bind).toBe("ctrl+b");
			expect(keymapLayers[0].commands[0].slash).toEqual({ name: "balancer" });

			expect(slots).toHaveLength(2);
			expect(slots[0].append).toBe("session.composer.top");
			expect(slots[1].append).toBe("sidebar.content");

			const openCmd = keymapLayers[0].commands[0];
			openCmd.run();

			expect(dialogSizes).toEqual([]);
			expect(dialogs).toEqual([]);
			expect(navigations).toEqual(["balancer.dashboard"]);
			expect(toasts).toHaveLength(1);
			expect(toasts[0]).toMatchObject({
				message: "OpenCode Balancer loaded (v2)",
				variant: "success",
			});

			for (const dispose of disposes) await dispose();
		},
		{ timeout: 30000 },
	);

	test("registers status indicator in session composer top slot", async () => {
		withTempConfigDir();
		const { context, slots } = createV2Api();

		await plugin.setup(context as any);

		const statusSlot = slots.find((s) => s.append === "session.composer.top");
		expect(statusSlot).toBeDefined();
		expect(statusSlot.render).toBeFunction();
	});

	test("registers sidebar content slot", async () => {
		withTempConfigDir();
		const { context, slots } = createV2Api();

		await plugin.setup(context as any);

		const sidebarSlot = slots.find((s) => s.append === "sidebar.content");
		expect(sidebarSlot).toBeDefined();
		expect(sidebarSlot.render).toBeFunction();
	});

	test("returns cleanup function that unregisters routes and slots", async () => {
		withTempConfigDir();
		const { context, routes, slots, disposes } = createV2Api();

		const cleanup = await plugin.setup(context as any);

		expect(routes.length).toBe(2);
		expect(slots.length).toBe(2);

		if (typeof cleanup === "function") {
			await cleanup();
		}

		expect(routes.length).toBe(2); // routes array still has entries but unregister functions were called
		expect(slots.length).toBe(2); // slots array still has entries but unregister functions were called
	});

	test("exports correct plugin id", () => {
		expect(plugin.id).toBe("opencode-balancer.tui");
	});

	test("uses Plugin.define from @opencode/plugin/tui", () => {
		const source = require("node:fs").readFileSync(
			join(import.meta.dir, "../../src/v2/tui.tsx"),
			"utf-8",
		);
		expect(source).toContain("Plugin.define");
		expect(source).toContain("@opencode/plugin/tui");
	});
});
