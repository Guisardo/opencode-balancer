import { Plugin as PluginV2 } from "@opencode/plugin";
import { createServerHooksV2 } from "../server/index.v2";

export default PluginV2.define({
	id: "opencode-balancer",
	async setup(ctx: PluginV2.Context) {
		const hooks = await createServerHooksV2(ctx);

		// Register hooks
		const modelRequestReg = await ctx.session.hook(
			"model.request",
			hooks.modelRequest,
		);
		const contextReg = await ctx.session.hook("context", hooks.context);
		const commandReg = await ctx.command.transform(hooks.commandTransform);
		const toolReg = await ctx.tool.transform(hooks.toolTransform);

		// Cleanup function
		return () => {
			modelRequestReg.dispose();
			contextReg.dispose();
			commandReg.dispose();
			toolReg.dispose();
			hooks.dispose?.();
		};
	},
});
