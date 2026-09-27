## Problem Statement

The build system needs to produce both v1 and v2 plugin entrypoints from a single codebase, with correct package.json exports so consumers on either OpenCode version can import the plugin.

## Solution

A Bun-based build script that compiles TypeScript/TSX sources to ESM JavaScript for both v1 and v2 entrypoints, with proper external dependencies and source maps.

## User Stories

1. As a plugin developer, I want a single build command that produces both v1 and v2 artifacts, so I don't need separate build processes.

2. As an OpenCode v1 user, I want to import the plugin via the main export and get a working `server` function.

3. As an OpenCode v2 user, I want to import the plugin via the main export and get a working `Plugin.define` default export.

4. As a package consumer, I want explicit subpath exports (`./v2`, `./v2/tui`, `./tui`) for version-specific imports.

5. As a CI system, I want the build to be fast and deterministic.

## Implementation Decisions

### Build Script
- `scripts/build.ts` using `Bun.build()`
- Two parallel build passes: v1 entrypoints → `dist/`, v2 entrypoints → `dist/v2/`
- v1 entrypoints: `src/index.ts` (dual entrypoint), `src/tui/tui.tsx`
- v2 entrypoints: `src/v2/index.ts`, `src/v2/tui.tsx`
- External dependencies: `@opencode-ai/plugin`, `@opencode/plugin`, `@opentui/*`, `solid-js`
- `@opentui/solid` Bun plugin for JSX transform
- Minification enabled, external source maps, target: bun

### Package Exports
- `"."` → `./dist/index.js` (dual entrypoint)
- `"./v2"` → `./dist/v2/index.js` (v2 server)
- `"./v2/tui"` → `./dist/v2/tui.js` (v2 TUI)
- `"./tui"` → `./dist/tui/tui.js` (v1 TUI)

### Dependencies
- `@opencode-ai/plugin` ^1.14.51 (v1 peer)
- `@opencode/plugin` ^2.0.16 (v2 peer)
- `@opentui/solid` ^0.5.8 (both)
- `solid-js` ^1.9.12

## Testing Decisions

- Build output verified by entrypoint tests (`test/index.test.ts`, `test/v2-index.test.ts`)
- CI runs build before tests
- Source maps stripped of sourcesContent for smaller artifacts

## Out of Scope

- TypeScript type checking (separate `checktypes` script)
- Non-Bun runtime builds
- V1 TUI component bundling (components remain as source)

## Further Notes

Implemented in PR #14. Related to dual entrypoint spec (#17).