## Problem Statement

OpenCode v1 and v2 have different server plugin hook APIs. The plugin needs to implement equivalent behavior for both versions using a shared core logic layer.

## Solution

Implement v2 server hooks in `src/server/index.v2.ts` that map from v1 hook signatures to v2 hook signatures, sharing core logic (database, accounts, priority, request balancing) from `src/core/*`.

## User Stories

1. As a developer, I want the same balancing logic to work identically in v1 and v2.

2. As an OpenCode v1 user, I want `chat.headers`, `chat.message`, `command.execute.before`, `tool`, `config`, `experimental.chat.messages.transform` hooks to work.

3. As an OpenCode v2 user, I want `model.request`, `context`, `command.transform`, `tool.transform` hooks to work.

4. As a maintainer, I want hook implementations in one place (shared core) with thin version-specific adapters.

## Implementation Decisions

### Hook Mapping (from ticket #10 grilling)
| v1 Hook | v2 Hook | Notes |
|---------|---------|-------|
| `chat.headers` | `model.request` | Both: modify request headers for active account auth |
| `chat.message` | `context` | Both: set/override model selection per message |
| `command.execute.before` | `command.transform` | Both: intercept `/balancer` command |
| `tool` (balancer_command) | `tool.transform` (balancer_command) | Both: expose fallback command as tool |
| `config` | (domain transforms) | v2 uses domain transforms for config |
| `experimental.chat.messages.transform` | `context` | Both: filter balancer metadata from messages |

### Shared Core Logic
- `src/core/accounts.ts` - account CRUD, active/selected account logic
- `src/core/priority.ts` - provider priority, balancing, model selection
- `src/core/database.ts` - SQLite connection, migrations
- `src/core/schema.ts` - database schema and migrations
- `src/server/request-balancer.ts` - request tracking, failover
- `src/server/commands.ts` - fallback `/balancer` command logic
- `src/server/cache-update.ts` - sandbox cache invalidation
- `src/server/fetch-patch.ts` - fetch interception for auth failover
- `src/server/native.ts` - native auth integration

### v1 Implementation (`src/server/index.ts`)
- `createServerHooks({ cacheUpdate, db, client })` returns v1 `Hooks` object
- Uses `@opencode-ai/plugin` types
- `serverPlugin` async function called by v1 loader

### v2 Implementation (`src/server/index.v2.ts`)
- `createServerHooksV2(ctx, db?)` returns `{ modelRequest, context, commandTransform, toolTransform, dispose }`
- Uses `@opencode/plugin` types (local interfaces to avoid import issues)
- Accepts optional `db` parameter for testing (matches v1 pattern)
- `setup` function in `src/v2/index.ts` registers hooks via `ctx.session.hook`, `ctx.command.transform`, `ctx.tool.transform`
- Cleanup via returned dispose function

### Key Behavioral Differences Handled
- v1 `chat.headers` receives `(input, output)` with `output.headers`; v2 `model.request` receives `event` with mutable `event.headers`
- v1 `chat.message` receives `(input, output)` with `output.message.model`; v2 `context` receives `event` with mutable `event.options.model`
- v1 `command.execute.before` throws error to stop execution; v2 `command.transform` adds command to editor
- v1 `tool` defines tool in hooks object; v2 `tool.transform` adds tool to editor
- v2 `model.request` uses `ctx.permission.set()` for OAuth (v1 used `setNativeAuth` via client)

## Testing Decisions

- `test/server/index.test.ts` - 9 v1 hook tests with mocked v1 context
- `test/server/index.v2.test.ts` - 9 v2 hook tests with mocked v2 context
- Both test identical scenarios: active account headers, OAuth permission, balancing on/off, provider fallback, rate limiting, command registration, tool registration
- Mock contexts match each version's API shape

## Out of Scope

- v2 `permission` domain hooks (not needed for balancer)
- v2 `provider` domain hooks (not needed)
- Real OpenCode runtime integration tests

## Further Notes

Decisions from ticket #10 (grilling-server-hook-mapping). Implemented in `src/server/index.v2.ts` and `src/v2/index.ts`. Related to dual entrypoint spec (#17) and build system spec (#22).