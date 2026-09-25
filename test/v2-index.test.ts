import { describe, expect, test } from "bun:test";

import plugin from "../src/v2/index";

describe("v2 plugin entrypoint", () => {
	test("exports a v2 Plugin.define'd plugin with correct id", () => {
		expect(plugin.id).toBe("opencode-balancer");
	});

	test("exports setup function", () => {
		expect(typeof plugin.setup).toBe("function");
	});
});
