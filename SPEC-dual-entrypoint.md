## Problem Statement

OpenCode is transitioning from plugin API v1 (`@opencode-ai/plugin`) to v2 (`@opencode/plugin`). The opencode-balancer plugin needs to work with both versions simultaneously from a single codebase, so users on either version can use the plugin without maintaining separate forks.

The current package export `"."` points only to the v2 entrypoint (`./dist/v2/index.js`), making it impossible for v1 consumers to access the required `server` named export.

## Solution

Implement a dual entrypoint pattern at the main package export (`"."`) that provides both:
- **v1 compatibility**: A `server` named export that v1's plugin loader calls as a function
- **v2 compatibility**: A default export of `Plugin.define({ id, setup })` that v2's plugin system calls

This follows the official migration guide pattern: `export { ...Plugin.define({...}), server }` from a single module.

## User Stories

1. As a plugin developer maintaining opencode-balancer, I want a single codebase that works with both OpenCode v1 and v2, so that I don't need to maintain two separate plugin packages.

2. As an OpenCode v1 user, I want to install `@guisardo/opencode-balancer` and have it work via the `server` export, so that my existing setup continues to function.

3. As an OpenCode v2 user, I want to install `@guisardo/opencode-balancer` and have it work via the default `Plugin.define` export, so that I can use the new plugin system.

4. As a plugin developer, I want the dual entrypoint to share core logic (database, accounts, priority, hooks) between v1 and v2 implementations, so that behavior is consistent and maintenance is minimized.

5. As a CI system, I want to test both v1 and v2 entrypoints in the same test suite, so that regressions are caught for both versions.

6. As a package consumer, I want the same package.json exports to work for both versions, so that my import statements don't need version-specific paths.

## Implementation Decisions

### Dual Entrypoint Module
- Location: `src/index.ts` (replaces the previous v1-only entrypoint)
- Exports:
  - `server` (named export): The v1 server plugin function that accepts `{ client }` and returns hooks
  - `default` export: `PluginV2.define({ id: "opencode-balancer", async setup(ctx) {...} })` for v2
- Both entrypoints share the same core server hook logic via `createServerHooksV2` (v2) and `createServerHooks` (v1)

### Package Exports Configuration
- `"."` → `./dist/index.js` (the dual entrypoint)
- `"./v2"` → `./dist/v2/index.js` (v2 server-only entrypoint, for explicit v2 imports)
- `"./v2/tui"` → `./dist/v2/tui.js` (v2 TUI plugin)
- `"./tui"` → `./dist/tui/tui.js` (v1 TUI plugin, unchanged)

### Shared Logic Architecture
- Core utilities (`src/core/*`) are version-agnostic and used by both entrypoints
- Server hooks have parallel implementations:
  - `src/server/index.ts` → v1 `createServerHooks` returning v1 `Hooks` object
  - `src/server/index.v2.ts` → v2 `createServerHooksV2` returning v2 hook functions
- TUI plugins have parallel implementations:
  - `src/tui/tui.tsx` → v1 `tui` function using `api` parameter
  - `src/v2/tui.tsx` → v2 `Plugin.define` with `setup(context)` using v2 APIs

### Build System
- `scripts/build.ts` builds both v1 and v2 entrypoints in parallel
- v1 entrypoints: `src/index.ts`, `src/tui/tui.tsx` → `dist/`
- v2 entrypoints: `src/v2/index.ts`, `src/v2/tui.tsx` → `dist/v2/`
- Both use `@opentui/solid` Bun plugin for JSX transformation

### Version Detection
- No runtime version detection needed — the dual entrypoint pattern handles it statically
- v1 loads the package and calls the `server` export
- v2 loads the package and calls `setup()` on the default export
- Feature detection via `Plugin.define` existence (per migration guide)

## Testing Decisions

### Test Seams
1. **Entry point tests** (highest seam):
   - `test/index.test.ts`: Verifies v1 entrypoint exports a callable function with `server` property and `tui` function
   - `test/v2-index.test.ts`: Verifies v2 entrypoint exports `Plugin.define` result with `id` and `setup` function

2. **Server hook tests** (shared logic seam):
   - `test/server/index.test.ts`: Tests v1 hook behaviors (chat.headers, chat.message, command.execute.before, tool, config, experimental.chat.messages.transform)
   - `test/server/index.v2.test.ts`: Tests v2 hook behaviors (model.request, context, command.transform, tool.transform) with mocked v2 context

3. **TUI plugin tests** (shared logic seam):
   - `test/tui/tui.test.ts`: Tests v1 TUI plugin (routes, commands/keymaps, slots, dialogs)
   - `test/tui/v2-tui.test.ts`: Tests v2 TUI plugin (router.register, keymap.layer, ui.slot, ui.toast)

4. **CI Matrix** (integration seam):
   - `.github/workflows/test.yml` runs tests against both `@opencode-ai/plugin@1` and `@opencode/plugin@2`

### Test Principles
- Test external behavior only (hook outputs, registered routes/commands/slots, cleanup)
- Use mocked contexts that match each version's API shape
- Avoid implementation detail assertions (internal function calls, private state)
- Pre-existing Windows EBUSY file-locking failures in cleanup are acknowledged and out of scope for this spec

## Out of Scope

- Supporting original Go-based opencode (archived) — only `@opencode-ai/plugin` v1/v2
- Migrating to Crush plugin system (different architecture)
- Backporting v2 features to v1 — only compatibility, not feature parity
- Real OpenCode runtime integration tests (mocked contexts are sufficient per testing strategy decision)
- Fixing Windows EBUSY file-locking cleanup bugs in tests (pre-existing, unrelated)

## Further Notes

The dual entrypoint implementation was validated by:
- Prototype (ticket #9): Confirmed both `server()` and `setup()` work from single export
- Grilling (ticket #6): Confirmed migration guide pattern with re-export shims
- Grilling (ticket #10): Confirmed server hook mapping v1→v2
- Grilling (ticket #12): Confirmed TUI API mapping v1→v2

The wayfinder map (issue #2) tracks all decisions. Ticket #17 marks the dual entrypoint main export as complete.

Related work in progress:
- PR #14: Adds v2 testing infrastructure and build system dual entrypoints
- Ticket #16: Config migration docs (README/INSTALL.txt updates for v2 `plugins` key)