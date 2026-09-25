## Testing Infrastructure Complete ✅

Implemented testing infrastructure for dual v1/v2 compatibility:

### Created Test Files
- **test/server/index.v2.test.ts** - 9 tests for v2 server plugin hooks (modelRequest, context, commandTransform, toolTransform)
- **test/tui/v2-tui.test.ts** - 6 tests for v2 TUI plugin (routes, keymap, slots, cleanup)
- **test/v2-index.test.ts** - 2 tests for v2 plugin entrypoint

### GitHub Actions CI
- **`.github/workflows/test.yml`** - Matrix testing against both v1 (`@opencode-ai/plugin@1`) and v2 (`@opencode/plugin@2`)

### Test Results
All 17 v2 tests pass:
```
test/v2-index.test.ts:        2 pass
test/server/index.v2.test.ts: 9 pass  
test/tui/v2-tui.test.ts:      6 pass
```

### Strategy
- **Dual installation**: CI installs both `@opencode-ai/plugin@1` and `@opencode/plugin@2` in separate matrix jobs
- **Separate test files**: v2 tests are in dedicated files to avoid version conflicts
- **Shared core logic**: Core utilities (accounts, priority, database, schema) are tested once and work for both versions
- **Mock v2 APIs**: Tests mock v2-specific APIs (`ctx.session.hook`, `ctx.command.transform`, `ctx.tool.transform`, `context.ui.router`, `context.keymap.layer`, etc.)

### Pre-existing Issues (Not Related to This Work)
- 19 test failures due to Windows file locking (EBUSY) and one schema test - these existed before this work
- All v1 tests that were passing before continue to pass