## Problem Statement

Core plugin logic (database, accounts, priority, balancing, events, usage) must work identically for both v1 and v2 entrypoints without duplication.

## Solution

Version-agnostic core modules in `src/core/*` and `src/server/*` (non-hook files) that are imported by both v1 and v2 implementations.

## User Stories

1. As a developer, I want account/priority/balancing logic in one place so fixes apply to both versions.

2. As a maintainer, I want database schema and migrations shared so v1 and v2 use identical storage.

3. As a tester, I want to test core logic once and trust it works for both entrypoints.

## Implementation Decisions

### Shared Core Modules (`src/core/`)
| Module | Responsibility | Used By |
|--------|----------------|---------|
| `accounts.ts` | Account CRUD, active/selected account, alias normalization | v1 hooks, v2 hooks, TUI actions |
| `priority.ts` | Provider priority list, balancing toggle, model selection, `resolveActiveSelection` | v1 hooks, v2 hooks |
| `database.ts` | `openBalancerDatabase`, `closeBalancerDatabase`, connection caching | v1 hooks, v2 hooks |
| `schema.ts` | `migrate()`, table definitions, version tracking | v1 hooks, v2 hooks |
| `types.ts` | TypeScript interfaces: `AuthInfo`, `Account`, `ProviderState`, etc. | All |
| `path.ts` | Config/store path resolution (XDG, Windows LOCALAPPDATA) | All |
| `events.ts` | Event log (account changes, usage, errors) | TUI actions |
| `usage-store.ts` | Usage snapshots (exact, redacted, confidence) | TUI actions, usage services |

### Shared Server Modules (`src/server/`)
| Module | Responsibility | Used By |
|--------|----------------|---------|
| `request-balancer.ts` | Request tracking, failover logic, rate limiting | v1 fetch-patch, v2 modelRequest |
| `commands.ts` | `runFallbackBalancerCommand` - `/balancer` CLI logic | v1 command.execute.before, v2 commandTransform |
| `cache-update.ts` | Sandbox cache invalidation for `@latest` | v1 serverPlugin, v2 createServerHooksV2 |
| `fetch-patch.ts` | Global fetch interception for auth failover | v1 serverPlugin, v2 createServerHooksV2 |
| `native.ts` | Native auth integration (`setNativeAuth`, `showToast`) | v1 hooks (v2 uses ctx.permission) |

### Version-Specific Adapters
- **v1** (`src/server/index.ts`): `createServerHooks({ cacheUpdate, db, client })` → wraps core logic in v1 `Hooks` interface
- **v2** (`src/server/index.v2.ts`): `createServerHooksV2(ctx, db?)` → wraps core logic in v2 hook functions
- **v1 TUI** (`src/tui/tui.tsx`): `tui(api)` → uses core logic via `state.ts`, `actions.ts`
- **v2 TUI** (`src/v2/tui.tsx`): `setup(context)` → uses same `state.ts`, `actions.ts` via shared components

### Database Parameter Pattern
Both `createServerHooks` and `createServerHooksV2` accept optional `db` parameter for testing:
```typescript
// v1
createServerHooks({ cacheUpdate, db, client })

// v2  
createServerHooksV2(ctx, db?)
```
Allows tests to inject mock database while production uses `openBalancerDatabase(storePath())`.

### State Management
- `src/tui/state.ts` - `createBalancerTuiState()` creates reactive signals for accounts, pending, events
- Same state instance shared across v1/v2 TUI via component props
- Disposal via `state.dispose()` closes database connection

## Testing Decisions

- Core modules tested directly: `test/core/accounts.test.ts`, `priority.test.ts`, `schema.test.ts`, `database.test.ts`, `path.test.ts`, `events.test.ts`, `usage-store.test.ts`, `pending.test.ts`
- Server modules tested: `test/server/fetch-patch.test.ts`, `cache-update.test.ts`, `request-balancer.test.ts`, `commands.test.ts`, `auth-watcher.test.ts`
- TUI logic tested: `test/tui/state.test.ts`, `actions.test.ts`, `balancer-bar-sync.test.ts`, `selected-account-bar-sync.test.ts`, `native-model-apply.test.ts`, `connect.test.ts`, `usage-auto-refresh.test.ts`
- Hook integration tests verify core logic wired correctly for each version

## Out of Scope

- Version-specific hook registration (covered in server-hooks and TUI-api specs)
- Real database integration tests (unit tests use temp SQLite)

## Further Notes

This shared architecture was validated by prototype (#9) and grilling decisions (#6, #10, #12). Enables "single codebase, dual entrypoint" strategy. Related to dual entrypoint spec (#17), server hooks spec (#26), TUI API spec (#27).