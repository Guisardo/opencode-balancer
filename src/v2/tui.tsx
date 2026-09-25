/** @jsxImportSource @opentui/solid */

import { Plugin } from "@opencode/plugin/tui";
import { Show } from "solid-js";

export default Plugin.define({
	id: "opencode-balancer.tui",
	async setup(context) {
		await import("@opentui/solid/runtime-plugin" + "-support");

		// Show toast on load
		context.ui.toast.show({
			message: "OpenCode Balancer loaded (v2)",
			variant: "success",
		});

		// Register dashboard route
		const unregisterDashboard = context.ui.router.register({
			name: "balancer.dashboard",
			render: () => (
				<box>
					<text fg="accent">OpenCode Balancer</text>
					<text fg="muted">Dashboard - v2 implementation pending</text>
				</box>
			),
		});

		// Register priority route
		const unregisterPriority = context.ui.router.register({
			name: "balancer.priority",
			render: () => (
				<box>
					<text fg="accent">OpenCode Balancer</text>
					<text fg="muted">Priority Screen - v2 implementation pending</text>
				</box>
			),
		});

		// Register keymap layer (returns void, cleanup is automatic)
		context.keymap.layer(() => ({
			bindings: ["balancer.dashboard.open"],
			commands: [
				{
					bind: "ctrl+b",
					group: "Plugin",
					id: "balancer.dashboard.open",
					palette: true,
					run: () => {
						context.ui.router.navigate({
							name: "balancer.dashboard",
							type: "plugin",
						});
					},
					slash: { name: "balancer" },
					title: "Open Balancer Dashboard",
				},
			],
			mode: "global",
		}));

		// Register status indicator in session composer top
		const unregisterStatus = context.ui.slot({
			append: "session.composer.top",
			render: ({ sessionID }: any) => (
				<Show when={!!sessionID}>
					<text fg="accent">⚖ Balancer</text>
				</Show>
			),
		});

		// Register sidebar content
		const unregisterSidebar = context.ui.slot({
			append: "sidebar.content",
			render: ({ sessionID }: any) => (
				<Show when={!!sessionID}>
					<box>
						<text fg="accent">Balancer</text>
						<text fg="muted">Sidebar - v2 implementation pending</text>
					</box>
				</Show>
			),
		});

		// Return cleanup function
		return () => {
			unregisterDashboard();
			unregisterPriority();
			unregisterStatus();
			unregisterSidebar();
			// keymap.layer cleanup is automatic
		};
	},
});
