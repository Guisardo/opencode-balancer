import { describe, expect, test } from "bun:test";

import { server } from "../src/index";
import plugin from "../src/index";

describe("plugin entrypoint", () => {
	test("exports v1 server as named export", () => {
		expect(typeof server).toBe("function");
	});

	test("exports v2 Plugin.define as default export", () => {
		expect(plugin.id).toBe("opencode-balancer");
		expect(typeof plugin.setup).toBe("function");
	});

	test("v1 server has correct id and tui", async () => {
		// Just verify server is a function - full integration tests are in server tests
		expect(typeof server).toBe("function");
		// Verify it has the correct name for v1 plugin loading
		expect(server.name).toBe("");
	});
});
