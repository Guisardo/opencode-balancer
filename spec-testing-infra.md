## Problem Statement

Tests need to run against both OpenCode v1 and v2 plugin APIs to ensure dual compatibility, using mocked contexts since real runtime integration tests are not needed.

## Solution

A test infrastructure with:
- CI matrix running tests against `@opencode-ai/plugin@1` and `@opencode/plugin@2`
- Mocked v1 and v2 context objects matching each version's API
- Shared test utilities for database, accounts, and context creation
- Bun test runner with per-test cleanup

## User Stories

1. As a developer, I want to run `bun test` and have all tests pass for both v1 and v2 entrypoints.

2. As a CI system, I want a matrix that tests against both plugin versions in parallel.

3. As a test author, I want reusable mock factories for v1/v2 contexts so tests are consistent.

4. As a maintainer, I want Windows file-locking (EBUSY) cleanup issues acknowledged but not blocking.

## Implementation Decisions

### CI Matrix
- `.github/workflows/test.yml` with matrix: `plugin: [@opencode-ai/plugin@1, @opencode/plugin@2]`
- Each job installs the plugin version and runs `bun test`

### Mock Contexts
- v1 mock: `{ client, session: { hook }, command: { execute: { before } }, tool, config, experimental }`
- v2 mock: `{ client, session: { hook }, command: { transform }, tool: { transform }, permission }`
- Mock factories in test files create fresh instances per test

### Test Utilities
- `db()` / `cleanup()` for temporary SQLite databases
- `createMockV1Context()`, `createMockV2Context()` for plugin contexts
- Account/priority helpers from `src/core/*`

### Test Files
- `test/index.test.ts` - v1 entrypoint
- `test/v2-index.test.ts` - v2 entrypoint
- `test/server/index.test.ts` - v1 server hooks
- `test/server/index.v2.test.ts` - v2 server hooks
- `test/tui/tui.test.ts` - v1 TUI
- `test/tui/v2-tui.test.ts` - v2 TUI

## Testing Decisions

- Test external behavior only (hook outputs, registered routes/commands/slots)
- No implementation detail assertions
- Per-test temp directories with cleanup (retry on EBUSY)
- 242 passing tests, 19 pre-existing EBUSY failures acknowledged

## Out of Scope

- Real OpenCode runtime integration tests
- Fixing Windows EBUSY file-locking (pre-existing, unrelated)
- E2E browser tests

## Further Notes

Implemented in PR #14 and #13. Related to dual entrypoint spec (#17).