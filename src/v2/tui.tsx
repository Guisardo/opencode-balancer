/** @jsxImportSource @opentui/solid */

import { Plugin } from "@opencode/plugin/tui";
import { createComponent } from "solid-js";
import { getSelectedAccount, getSelectedModel } from "../core/accounts";
import { getBalancingEnabled, setProviderModel } from "../core/priority";
import { activateAccount, removeAccountFromTui } from "../tui/actions";
import { createTuiBalancerBarSync } from "../tui/balancer-bar-sync";
import { openNativeConnect } from "../tui/connect";
import { createNativeModelApplier } from "../tui/native-model-apply";
import { providerModelOptions } from "../tui/provider-models";
import { createSelectedAccountBarSync } from "../tui/selected-account-bar-sync";
import { createBalancerTuiState } from "../tui/state";
import { createUsageAutoRefresh } from "../tui/usage-auto-refresh";

type DashboardModule = typeof import("../tui/components/dashboard");
type PriorityScreenModule = typeof import("../tui/components/priority-screen");
type ProviderModelDialogModule = typeof import("../tui/components/provider-model-dialog");
type RenameDialogModule = typeof import("../tui/components/rename-dialog");
type SidebarModule = typeof import("../tui/components/sidebar");
type StatusIndicatorModule = typeof import("../tui/components/status-indicator");

function inferProviderID(session: unknown) {
	const providerID = (
		session as { model?: { providerID?: unknown } } | undefined
	)?.model?.providerID;
	return typeof providerID === "string" && providerID.length > 0
		? providerID
		: undefined;
}

function copyRoute(route: { name: string; params?: Record<string, unknown> }): {
	name: string;
	params?: Record<string, unknown>;
} {
	return "params" in route && route.params
		? { name: route.name, params: { ...route.params } }
		: { name: route.name };
}

// Type assertion helper - v2 context has compatible runtime shape with TuiPluginApi
function asTuiApi(context: any) {
	return context as any;
}

export default Plugin.define({
	id: "opencode-balancer.tui",
	async setup(context: any) {
		await import("@opentui/solid/runtime-plugin" + "-support");

		const [
			dashboardModule,
			priorityScreenModule,
			providerModelDialogModule,
			renameDialogModule,
			sidebarModule,
			statusIndicatorModule,
		] = await Promise.all([
			import("../tui/components/dashboard" + ".tsx") as Promise<DashboardModule>,
			import(
				"../tui/components/priority-screen" + ".tsx"
			) as Promise<PriorityScreenModule>,
			import(
				"../tui/components/provider-model-dialog" + ".tsx"
			) as Promise<ProviderModelDialogModule>,
			import(
				"../tui/components/rename-dialog" + ".tsx"
			) as Promise<RenameDialogModule>,
			import("../tui/components/sidebar" + ".tsx") as Promise<SidebarModule>,
			import(
				"../tui/components/status-indicator" + ".tsx"
			) as Promise<StatusIndicatorModule>,
		]);

		const state = createBalancerTuiState();
		const usageAutoRefresh = createUsageAutoRefresh(asTuiApi(context), state);
		const balancerBarSync = createTuiBalancerBarSync(asTuiApi(context), state);
		const nativeModelApplier = createNativeModelApplier(asTuiApi(context));
		let dashboardReturnRoute: { name: string; params?: Record<string, unknown> } | undefined;
		let nativeProviderID: string | undefined;
		let sessionProviderID: string | undefined;

		const applyNativeProviderModel = async (providerID: string) => {
			const modelOptions = providerModelOptions(
				context.state.provider,
				providerID,
			);
			const selected = getSelectedModel(state.db, providerID);
			const option =
				modelOptions.find((item) => item.modelID === selected?.modelID) ??
				modelOptions[0];
			if (!option) return false;
			return nativeModelApplier(
				{ modelID: option.modelID, providerID: option.providerID },
				option.title,
			);
		};

		const applyNativeProviderModelAndTrack = async (providerID: string) => {
			const applied = await applyNativeProviderModel(providerID);
			if (applied) nativeProviderID = providerID;
			return applied;
		};

		const selectedAccountBarSync = createSelectedAccountBarSync({
			applyProvider: applyNativeProviderModelAndTrack,
			currentProvider: () => nativeProviderID ?? sessionProviderID,
			dialogOpen: () => context.ui.dialog.open,
			selectedProvider: () =>
				getBalancingEnabled(state.db)
					? undefined
					: getSelectedAccount(state.db)?.providerID,
		});

		context.lifecycle.onDispose(() => {
			usageAutoRefresh.dispose();
			state.dispose();
		});

		const openDashboard = () => {
			if (context.route.current.name !== "balancer.dashboard")
				dashboardReturnRoute = copyRoute(context.route.current);
			context.route.navigate("balancer.dashboard");
		};

		const openPriority = () => {
			context.route.navigate("balancer.priority");
		};

		const backFromDashboard = () => {
			const route = dashboardReturnRoute;
			dashboardReturnRoute = undefined;
			if (route)
				context.route.navigate(
					route.name,
					"params" in route ? route.params : undefined,
				);
			else context.route.navigate("home");
		};

		const unregisterDashboard = context.ui.router.register([
			{
				name: "balancer.dashboard",
				render: () =>
					createComponent(dashboardModule.Dashboard, {
						api: asTuiApi(context),
						onBack: backFromDashboard,
						openConnect: () =>
							openNativeConnect({ ...asTuiApi(context), db: state.db }),
						openPriority,
						removeAccount: (providerID, alias) =>
							removeAccountFromTui(
								asTuiApi(context),
								state,
								providerID,
								alias,
							),
						renameAccount: (providerID, alias) =>
							renameDialogModule.openRenameDialog(
								asTuiApi(context),
								state,
								providerID,
								alias,
							),
						state,
					}),
			},
			{
				name: "balancer.priority",
				render: () =>
					createComponent(priorityScreenModule.PriorityScreen, {
						api: asTuiApi(context),
						onBack: () => context.route.navigate("balancer.dashboard"),
						openModelPicker: (providerID, onComplete) =>
							providerModelDialogModule.openProviderModelDialog(
								asTuiApi(context),
								state,
								providerID,
								{
									applyNativeSelection: false,
									onComplete,
									onSelected: (model) =>
										setProviderModel(
											state.db,
											model.providerID,
											model.modelID,
										),
								},
							),
						state,
					}),
			},
		]);

		context.lifecycle.onDispose(unregisterDashboard);

		// Register keymap layer (v2 API)
		const unregisterKeymap = context.keymap.layer(() => ({
			bindings: [{ cmd: "balancer.dashboard.open", key: "ctrl+b" }],
			commands: [
				{
					bind: "ctrl+b",
					category: "Plugin",
					id: "balancer.dashboard.open",
					palette: true,
					run() {
						openDashboard();
					},
					slash: { name: "balancer" },
					title: "Open Balancer Dashboard",
				},
			],
			mode: "global",
		}));
		context.lifecycle.onDispose(unregisterKeymap);

		// Register status indicator in session composer top (v2 API)
		const unregisterStatus = context.ui.slot({
			append: "session.composer.top",
			render: ({ sessionID }: { sessionID: string }) =>
				createComponent(statusIndicatorModule.BalancerStatusIndicator, {
					api: asTuiApi(context),
					providerID: () =>
						inferProviderID(context.state.session.get(sessionID)),
					state,
				}),
		});
		context.lifecycle.onDispose(unregisterStatus);

		// Register sidebar content (v2 API)
		const unregisterSidebar = context.ui.slot({
			append: "sidebar.content",
			render: ({ sessionID }: { sessionID: string }) =>
				createComponent(sidebarModule.BalancerSidebar, {
					activateAccount: (providerID, alias) => {
						return activateAccount(
							asTuiApi(context),
							state,
							providerID,
							alias,
							{
								applyNativeProviderModel:
									applyNativeProviderModelAndTrack,
								sessionProviderID:
									nativeProviderID ??
									inferProviderID(
										context.state.session.get(sessionID),
									),
							},
						);
					},
					api: asTuiApi(context),
					openDashboard,
					state,
				}),
		});
		context.lifecycle.onDispose(unregisterSidebar);

		// Show toast on load
		context.ui.toast.show({
			message: "OpenCode Balancer loaded (v2)",
			variant: "success",
		});

		// Return cleanup function
		return () => {
			unregisterDashboard();
			unregisterKeymap();
			unregisterStatus();
			unregisterSidebar();
		};
	},
});