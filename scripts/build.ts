import { rm } from "node:fs/promises";
import solidTransformPlugin from "@opentui/solid/bun-plugin";

await rm("dist", { force: true, recursive: true });

// Build v1 entrypoints
const v1Result = await Bun.build({
	entrypoints: ["./src/index.ts", "./src/tui/tui.tsx"],
	external: [
		"./components/*",
		"@opencode-ai/plugin",
		"@opencode-ai/plugin/*",
		"@opentui/core",
		"@opentui/core/*",
		"@opentui/solid",
		"@opentui/solid/*",
		"solid-js",
		"solid-js/*",
		"web-tree-sitter",
		"web-tree-sitter/*",
	],
	format: "esm",
	minify: true,
	naming: {
		entry: "[dir]/[name].[ext]",
	},
	outdir: "dist",
	plugins: [solidTransformPlugin],
	sourcemap: "external",
	target: "bun",
});

if (!v1Result.success) {
	for (const log of v1Result.logs) console.error(log);
	process.exit(1);
}

// Build v2 entrypoints
const v2Result = await Bun.build({
	entrypoints: ["./src/v2/index.ts", "./src/v2/tui.tsx"],
	external: [
		"./components/*",
		"@opencode/plugin",
		"@opencode/plugin/*",
		"@opencode/plugin/tui",
		"@opentui/core",
		"@opentui/core/*",
		"@opentui/solid",
		"@opentui/solid/*",
		"solid-js",
		"solid-js/*",
		"web-tree-sitter",
		"web-tree-sitter/*",
	],
	format: "esm",
	minify: true,
	naming: {
		entry: "[name].[ext]",
	},
	outdir: "dist/v2",
	plugins: [solidTransformPlugin],
	sourcemap: "external",
	target: "bun",
});

if (!v2Result.success) {
	for (const log of v2Result.logs) console.error(log);
	process.exit(1);
}

await import("./copy-tui-source");

for (const output of [...v1Result.outputs, ...v2Result.outputs]) {
	if (!output.path.endsWith(".map")) continue;

	const sourceMap = (await output.json()) as { sourcesContent?: string[] };
	delete sourceMap.sourcesContent;
	await Bun.write(output.path, JSON.stringify(sourceMap));
}
