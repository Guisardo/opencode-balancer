## Problem Statement

OpenCode v1 and v2 have different TUI plugin APIs. The plugin needs to implement equivalent UI (routes, commands, slots, dialogs) for both versions using shared React/Solid components.

## Solution

Implement v2 TUI plugin in `src/v2/tui.tsx` that maps from v1 TUI API to v2 TUI API (`context.ui.router`, `context.ui.slot`, `context.keymap.layer`, `context.ui.dialog/toast`), sharing components from `src/tui/components/*` and logic from `src/tui/*`.

## User Stories

1. As a developer, I want the same dashboard, priority screen, sidebar, and status indicator to work in v1 and v2.

2. As an OpenCode v1 user, I want routes registered via `api.route.register`, commands via `api.command.register`/`api.keymap.registerLayer`, slots via `api.slots.register`.

3. As an OpenCode v2 user, I want routes via `context.ui.router.register`, keymaps via `context.keymap.layer`, slots via `context.ui.slot`, dialogs/toasts via `context.ui.dialog/toast`.

4. As a maintainer, I want UI components in one place (`src/tui/components/*`) with version-specific registration adapters.

## Implementation Decisions

### TUI API Mapping (from ticket #12 grilling)
| v1 API | v2 API | Notes |
|--------|--------|-------|
| `api.route.register([{ name, render }])` | `context.ui.router.register({ name, render })` | v2 takes single route object, returns unregister fn |
| `api.command.register(() => [{ category, keybind, ... }])` | `context.keymap.layer(() => ({ bindings, commands, mode }))` | v2 uses keymap layers with bindings array |
| `api.keymap.registerLayer({ bindings, commands })` | `context.keymap.layer(() => ({ bindings, commands, mode }))` | Same as above, v1 fallback |
| `api.slots.register({ session_prompt_right, sidebar_content })` | `context.ui.slot({ append, render })` | v2 slots registered individually |
| `api.ui.dialog.open(render)` | `context.ui.dialog.open(render)` | Same pattern |
| `api.ui.toast.show({ message, variant })` | `context.ui.toast.show({ message, variant })` | Same pattern |
| `api.lifecycle.onDispose(fn)` | `return () => {...}` from `setup` | v2 cleanup via setup return value |

### Shared Components (`src/tui/components/`)
- `Dashboard.tsx` - main dashboard with accounts, usage, actions
- `PriorityScreen.tsx` - provider priority list with model picker
- `Sidebar.tsx` - sidebar with account activation
- `StatusIndicator.tsx` - session composer status
- `ProviderModelDialog.tsx` - model selection dialog
- `RenameDialog.tsx` - account rename dialog
- `AliasDialog.tsx` - pending connection alias prompt
- `UsageBar.tsx` / `UsageDisplay.tsx` - usage visualization

### Shared Logic (`src/tui/`)
- `state.ts` - `createBalancerTuiState()` for reactive state
- `actions.ts` - `activateAccount`, `removeAccountFromTui`, etc.
- `balancer-bar-sync.ts` - sync native model bar
- `selected-account-bar-sync.ts` - sync selected account
- `native-model-apply.ts` - apply model via native dialog
- `provider-models.ts` - provider model options
- `connect.ts` - native provider connect flow
- `usage-auto-refresh.ts` - usage polling
- `dashboard-keys.ts` / `priority-keys.ts` - key handlers

### v1 Implementation (`src/tui/tui.tsx`)
- `tui(api)` async function
- Uses `@opencode-ai/plugin/tui` types
- Dynamic imports for components
- Registers routes, commands/keymaps, slots
- Returns cleanup via `api.lifecycle.onDispose`

### v2 Implementation (`src/v2/tui.tsx`)
- `Plugin.define({ id: "opencode-balancer.tui", async setup(context) })`
- Uses `@opencode/plugin/tui` Plugin
- Imports `@opentui/solid/runtime-plugin-support`
- Registers routes via `context.ui.router.register`
- Registers keymap layer via `context.keymap.layer`
- Registers slots via `context.ui.slot` (session.composer.top, sidebar.content)
- Shows toast on load: "OpenCode Balancer loaded (v2)"
- Returns cleanup function that calls all unregister functions

### Component Compatibility (from ticket #7 research)
- Components highly compatible - same `@opentui/solid` renderer
- v1 components work in v2 with minimal adaptation
- Components accept `api` prop (v1) or use `usePlugin()` hook (v2)
- Adapter pattern: pass v2 `context` as `api` to shared components

## Testing Decisions

- `test/tui/tui.test.ts` - v1 TUI: routes, commands, keymaps, slots, dialogs, native model apply
- `test/tui/v2-tui.test.ts` - v2 TUI: router.register, keymap.layer, ui.slot, ui.toast, cleanup
- Both verify same registrations: dashboard route, priority route, ctrl+b keymap, status slot, sidebar slot
- Mock contexts match each version's TUI API

## Out of Scope

- v2 `context.ui.panel` (not used)
- v2 `usePlugin()` hook in components (components use v1-style `api` prop)
- Real OpenCode TUI integration tests

## Further Notes

Decisions from ticket #12 (grilling-tui-api-mapping) and #7 (research-tui-component-compat). Implemented in `src/v2/tui.tsx`. Related to dual entrypoint spec (#17) and build system spec (#22).