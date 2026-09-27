## Problem Statement

The testing strategy needs to define how to validate dual v1/v2 compatibility without real OpenCode runtime, using mocked contexts at the highest possible seams.

## Solution

Test at four seams from highest to lowest:
1. **Entrypoint seam** - Verify exports match each version's expectations
2. **Server hook seam** - Test hook behaviors with mocked contexts
3. **TUI plugin seam** - Test route/command/slot registration
4. **CI matrix seam** - Run full suite against both plugin versions

## User Stories

1. As a developer, I want to know which tests validate v1 vs v2 compatibility.

2. As a reviewer, I want to see that each plugin surface is tested at the right abstraction level.

3. As a CI maintainer, I want the matrix to catch version-specific regressions.

## Implementation Decisions

### Seam 1: Entrypoint Tests
- `test/index.test.ts`: Default export is callable, has `server` function, `tui` function, correct `id`
- `test/v2-index.test.ts`: Default export has `id: "opencode-balancer"`, `setup` function

### Seam 2: Server Hook Tests
- v1: `test/server/index.test.ts` - 9 tests for chat.headers, chat.message, command.execute.before, tool, config, experimental.chat.messages.transform
- v2: `test/server/index.v2.test.ts` - 9 tests for model.request, context, command.transform, tool.transform
- Both use mocked contexts matching version API

### Seam 3: TUI Plugin Tests
- v1: `test/tui/tui.test.ts` - routes, commands/keymaps, slots, dialogs
- v2: `test/tui/v2-tui.test.ts` - router.register, keymap.layer, ui.slot, ui.toast
- Both use mocked TUI APIs

### Seam 4: CI Matrix
- Runs all tests against both plugin versions
- Catches version-specific API mismatches

## Testing Decisions

- Highest seam possible: entrypoint → hooks → CI matrix
- No new seams created; uses existing plugin loader interfaces
- Mocked contexts at hook/plugin level (not full runtime)
- External behavior only: outputs, registrations, cleanup

## Out of Scope

- Real OpenCode process integration tests
- Browser/E2E tests
- Performance benchmarks

## Further Notes

Decision recorded in ticket #15. Implemented in PR #14. Related to dual entrypoint spec (#17) and testing infra spec (#23).