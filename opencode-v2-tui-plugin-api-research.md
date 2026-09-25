# OpenCode v2 TUI Plugin API Research

**Source**: Official OpenCode v2 Documentation
- https://opencode.ai/v2/docs/build/plugins/cli
- https://opencode.ai/v2/docs/build/plugins
- https://opencode.ai/v2/docs/build/plugins/migrate-v1
- https://opencode.ai/v2/docs/cli/plugins
- https://opencode.ai/v2/docs/build/plugins/effect

**Package**: `@opencode/plugin` (v2.0.16+)
**TUI Import**: `@opencode/plugin/tui`

---

## 1. Route Registration API (Replaces v1 `api.route.register`)

### v2 API: `context.ui.router.register()`

Registers a JSX route that can be navigated to via the router.

```tsx
import { Plugin } from "@opencode/plugin/tui"

export default Plugin.define({
  id: "acme.dashboard",
  setup(context) {
    const unregister = context.ui.router.register({
      name: "dashboard",
      render: ({ data }) => <text>{String(data?.title ?? "Acme")}</text>,
    })
    
    // Returns cleanup function
    return unregister
  },
})
```

### Navigation

```tsx
// Navigate to plugin route with data
context.ui.router.navigate({ 
  type: "plugin", 
  name: "dashboard", 
  data: { title: "Status" } 
})

// Navigate to session
context.ui.router.navigate({ type: "session", sessionID })

// Navigate home
context.ui.router.navigate({ type: "home" })

// Get current route
const current = context.ui.router.current()
```

### Route Render Props

The render function receives:
- `data` - Data passed via `navigate({ type: "plugin", name, data })`
- Access to `usePlugin()` hook for context inside components

---

## 2. Slot API (Replaces v1 `api.slots.register`)

### v2 API: `context.ui.slot()`

Slots insert or replace JSX at specific extension points.

```tsx
// Append to sidebar content
return context.ui.slot({
  append: "sidebar.content",
  render: ({ sessionID }) => <text>{context.data.session.get(sessionID)?.title}</text>,
})

// Placement options: prepend, append, before, after, replace
context.ui.slot({ prepend: "home.footer", render: () => <text>Before footer content</text> })
context.ui.slot({ append: "home.footer", render: () => <text>After footer content</text> })
context.ui.slot({ before: "home.footer", render: () => <text>Before footer slot</text> })
context.ui.slot({ after: "home.footer", render: () => <text>After footer slot</text> })
context.ui.slot({ replace: "home.footer", render: () => <text>New footer</text> })
```

### Available Slot Locations

| Slot | Description |
|------|-------------|
| `app` | Root app level |
| `home.footer` | Home screen footer |
| `home.footer.status` | Status row in footer (after health indicators, before version) |
| `prompt.footer` | Prompt input footer |
| `prompt.footer.status` | Status in prompt footer |
| `prompt.footer.file` | File indicator in prompt footer |
| `session.composer.top` | Top of session composer |
| `sidebar.content` | Sidebar main content area |
| `sidebar.footer` | Sidebar footer |
| `session.panel` | Session panel contributions (see below) |

### Session Panels (via `session.panel` slot)

```tsx
import { Show } from "solid-js"
import { usePlugin } from "@opencode/plugin/tui"
import type { PanelInput } from "@opencode/plugin/tui/context"

// Register panel contribution
context.ui.slot({
  append: "session.panel",
  render: (panel) => (
    <Show when={panel.name === "acme.review"}>
      <ReviewPanel panel={panel} />
    </Show>
  ),
})

// Open panel from command
context.ui.slot({
  append: "app",
  render: () => {
    context.keymap.layer(() => ({
      mode: "global",
      commands: [{
        id: "acme.review",
        title: "Open review",
        slash: { name: "review" },
        run: () => context.ui.panel.open("acme.review"),
      }],
    }))
    return null
  },
})

// Panel component with access to panel props
function ReviewPanel(props: { panel: PanelInput }) {
  const context = usePlugin()
  context.keymap.layer(() => ({
    commands: [{
      id: "acme.review.fullscreen",
      bind: "f",
      run: props.panel.toggleFullscreen,
    }],
  }))
  return <text>Reviewing {props.panel.sessionID}</text>
}

// Panel props include: name, sessionID, width, presentation, focused, focus, close, toggleFullscreen
```

### Panel Management

```tsx
// Open panel (optionally fullscreen)
context.ui.panel.open("acme.review", { presentation: "fullscreen" })

// Get current panel
const current = context.ui.panel.current()

// Close current panel
context.ui.panel.close()
```

---

## 3. Keymap/Command Registration API (Replaces v1 `api.command.register` / `api.keymap.registerLayer`)

### v2 API: `context.keymap.layer()`

Registers a reactive keymap layer with commands and bindings.

```tsx
context.keymap.layer(() => ({
  mode: "global",        // or "insert", "normal", etc.
  priority: 10,          // layer priority (higher = more priority)
  commands: [
    {
      id: "acme.status",
      title: "Show Acme status",
      group: "Acme",
      bind: "ctrl+g",           // keyboard binding
      palette: true,            // show in command palette
      slash: {                  // slash command
        name: "acme",
        aliases: ["status"],
        arguments: true
      },
      enabled: () => true,      // reactive enablement
      suggested: true,          // suggest in palette
      run: async (input) => context.ui.toast.show({ message: input ?? "Ready" }),
    },
  ],
  bindings: ["acme.status"],   // which commands to bind keys for
}))
```

### Targeted Layers (for specific UI elements)

```tsx
context.keymap.layer(() => ({
  target: () => panel,  // target specific renderable
  commands: [{
    bind: "escape",
    run: (_input, event) => (event ? false : undefined)  // return false to continue dispatch
  }],
}))
```

### Keymap Utilities

```tsx
// Dispatch command programmatically
context.keymap.dispatch("acme.status", "verbose")

// Inspect shortcuts
const shortcuts = context.keymap.shortcuts("acme.status")

// Get all commands
const commands = context.keymap.commands()

// Check pending/input state
const pending = context.keymap.pending()
const active = context.keymap.active()

// Mode management
const currentMode = context.keymap.mode.current()
const popMode = context.keymap.mode.push("acme-search")
popMode()  // restore previous mode
```

---

## 4. Dialog/Toast APIs

### Dialogs: `context.ui.dialog`

```tsx
// Alert dialog
await context.ui.dialog.alert({ 
  title: "Acme", 
  message: "Ready" 
})

// Confirm dialog
const confirmed = await context.ui.dialog.confirm({
  title: "Continue?",
  message: "Run the Acme action?",
  label: { confirm: "Run", cancel: "Cancel" },
})

// Prompt dialog (text input)
const name = await context.ui.dialog.prompt({ 
  title: "Name", 
  placeholder: "release" 
})

// Select dialog
const mode = await context.ui.dialog.select({
  title: "Mode",
  current: "safe",
  options: [
    { title: "Safe", value: "safe", description: "Ask before changes" },
    { title: "Fast", value: "fast", disabled: false, category: "Advanced" },
  ],
})
```

### Custom JSX Dialogs

```tsx
// Set dialog size
context.ui.dialog.set({ size: "large", centered: true })

// Show custom JSX dialog
context.ui.dialog.show(
  () => (
    <box>
      <text>Acme</text>
    </box>
  ),
  () => console.log("closed"),  // onClose callback
)

// Clear dialog
context.ui.dialog.clear()
```

### Toasts: `context.ui.toast`

```tsx
context.ui.toast.show({
  title: "Acme",
  message: "Saved",
  variant: "success",  // "success" | "error" | "warning" | "info"
  duration: 3000,      // ms, default 3000
})
```

---

## 5. Router/Panel APIs

### Router: `context.ui.router`

```tsx
// Register route (see section 1)
const unregister = context.ui.router.register({
  name: "dashboard",
  render: ({ data }) => <text>{String(data?.title ?? "Acme")}</text>,
})

// Navigate
context.ui.router.navigate({ type: "plugin", name: "dashboard", data: { title: "Status" } })
context.ui.router.navigate({ type: "session", sessionID })
context.ui.router.navigate({ type: "home" })

// Get current route
const current = context.ui.router.current()

// Cleanup
return unregister
```

### Panel: `context.ui.panel`

```tsx
// Open session panel
context.ui.panel.open("acme.review")
context.ui.panel.open("acme.review", { presentation: "fullscreen" })

// Get current panel
const current = context.ui.panel.current()

// Close panel
context.ui.panel.close()
```

### Tabs: `context.ui.tabs` (when session tabs enabled)

```tsx
if (context.ui.tabs.enabled()) {
  context.ui.tabs.open(backgroundSessionID)
  context.ui.tabs.focus(sessionID)
  const tabs = context.ui.tabs.list()
  context.ui.tabs.move(backgroundSessionID, tabs.length - 1)
  context.ui.tabs.close(sessionID)
  context.ui.tabs.close()  // close current
}
```

---

## 6. Solid/JSX Renderer Context Changes

### Component Compatibility

OpenCode v2 uses **SolidJS** with **OpenTUI** renderer. Components must be compatible with Solid's reactivity model.

### `usePlugin()` Hook

Access plugin context inside JSX components (routes, dialogs, slots):

```tsx
import { usePlugin } from "@opencode/plugin/tui"

function Status() {
  const context = usePlugin()
  return <text fg={context.theme.text.base}>{context.app.version}</text>
}
```

### Renderer Access

```tsx
const renderer = context.renderer  // OpenTUI renderer instance
```

### JSX in Slots/Routes/Dialogs

All slot renders, route renders, and custom dialogs use Solid JSX:

```tsx
// Slot render
render: ({ sessionID }) => <text>{context.data.session.get(sessionID)?.title}</text>

// Route render
render: ({ data }) => <text>{String(data?.title ?? "Acme")}</text>

// Custom dialog
context.ui.dialog.show(
  () => (
    <box>
      <text>Custom content</text>
    </box>
  ),
  () => console.log("closed")
)
```

### Solid Primitives Available

- `createSignal`, `createEffect`, `createMemo`
- `Show`, `For`, `Switch`, `Match` (control flow)
- `usePlugin()` - plugin context
- All OpenTUI components: `<box>`, `<text>`, `<input>`, etc.

---

## 7. Theme Token Access

### v2 API: `context.theme`

Semantic theme tokens for use with OpenTUI elements:

```tsx
const Status = () => <text fg={context.theme.text.base}>Ready</text>

// Available theme tokens (semantic colors)
context.theme.text.base
context.theme.text.muted
context.theme.text.subtle
context.theme.background.base
context.theme.background.elevated
context.theme.border.base
context.theme.border.focus
context.theme.accent.base
context.theme.accent.muted
// ... and more semantic tokens
```

### Theme Usage in Components

```tsx
function MyComponent() {
  const context = usePlugin()
  return (
    <box bg={context.theme.background.base} border={{ color: context.theme.border.base }}>
      <text fg={context.theme.text.base}>Content</text>
      <text fg={context.theme.accent.base}>Accent</text>
    </box>
  )
}
```

---

## 8. Storage APIs

### Durable Storage: `context.storage.store()`

Persists JSON across restarts, synchronizes across TUI instances.

```tsx
const [settings, updateSettings] = context.storage.store("settings", {
  initial: { compact: false },
})

// Update via immer-style draft
await updateSettings((draft) => {
  draft.compact = true
})

// Read current value
const current = settings()  // reactive signal
```

### Memory Storage: `context.storage.memory()`

Survives plugin reloads but discarded when TUI exits.

```tsx
const [state, updateState] = context.storage.memory("state", {
  initial: { count: 0 },
})

updateState((draft) => {
  draft.count++
})

const current = state()  // reactive signal
```

### Server Plugin Storage (different API)

For non-TUI plugins, use `ctx.storage`:

```ts
// In server plugin setup(ctx)
await ctx.storage.set("settings", { strict: true })
const settings = await ctx.storage.get("settings")
await ctx.storage.remove("settings")

// Scan with prefix
const page = await ctx.storage.scan({ prefix: "cache/", limit: 100 })
```

---

## 9. Migration Notes: v1 → v2

### Configuration Changes

```jsonc
// V1
{
  "plugin": [
    "opencode-example-plugin",
    ["./plugin/local.ts", { "enabled": true }]
  ]
}

// V2
{
  "plugins": [
    "opencode-example-plugin",
    {
      "package": "./plugin/local.ts",
      "options": { "enabled": true }
    }
  ]
}
```

### Entrypoint Changes

```ts
// V1
import type { Plugin } from "@opencode-ai/plugin"
export const ExamplePlugin: Plugin = async ({ directory, project, client }) => {
  return { /* tools and hooks */ }
}

// V2
import { Plugin } from "@opencode/plugin"
export default Plugin.define({
  id: "example",
  async setup(ctx) {
    // Register hooks, transforms, tools here
    return () => { /* cleanup */ }
  },
})
```

### Context Mapping

| V1 | V2 |
|----|-----|
| `directory` | `ctx.location.directory` |
| `project` | `ctx.location.project` |
| `client` | Domain methods: `ctx.session`, `ctx.permission`, `ctx.agent`, etc. |
| `plugin options` | `ctx.options` |
| `dispose()` hook | Cleanup function returned by `setup` |
| `event` hook | `ctx.event.subscribe()` |
| Config/model/tool changes | Domain `transform(...)` |

### TUI-Specific Migration

| V1 API | V2 API |
|--------|--------|
| `api.route.register()` | `context.ui.router.register()` |
| `api.slots.register()` | `context.ui.slot()` |
| `api.command.register()` | `context.keymap.layer()` with commands |
| `api.keymap.registerLayer()` | `context.keymap.layer()` |
| `api.dialog.*` | `context.ui.dialog.*` |
| `api.toast.*` | `context.ui.toast.*` |
| `context.ui.router` | `context.ui.router` (similar) |
| `context.ui.panel` | `context.ui.panel` (similar) |
| `context.theme` | `context.theme` (similar) |
| `context.storage.store/memory` | `context.storage.store/memory` (similar) |

### Hook Registration Changes

```ts
// V1: Returned hooks object
return {
  "tool.execute.before": async (input, output) => { ... },
  "chat.message": async (input, output) => { ... },
}

// V2: Register in setup
async setup(ctx) {
  await ctx.tool.hook("execute.before", (event) => { ... })
  await ctx.session.hook("prompt", (event) => { ... })
  await ctx.session.hook("context", (event) => { ... })
  // ... etc.
}
```

### CLI Plugin Package Structure

```json
{
  "name": "opencode-acme-plugin",
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./tui": "./src/tui.tsx"
  },
  "dependencies": {
    "@opencode/plugin": "latest"
  },
  "peerDependencies": {
    "@opentui/core": ">=0.5.8",
    "@opentui/solid": ">=0.5.8",
    "solid-js": ">=1.9.0"
  }
}
```

### CLI-Only Plugins

For plugins that only run in the TUI (not on server), add to `cli.json`:

```json
{
  "plugins": [
    "opencode-example-plugin",
    "./plugins/status"
  ]
}
```

---

## 10. Complete TUI Plugin Example

```tsx
// src/tui.tsx
import { Plugin } from "@opencode/plugin/tui"
import { usePlugin } from "@opencode/plugin/tui"
import { Show } from "solid-js"

export default Plugin.define({
  id: "acme.tui",
  setup(context) {
    // Toast on load
    context.ui.toast.show({ message: "CLI plugin loaded", variant: "success" })

    // Register route
    const unregisterRoute = context.ui.router.register({
      name: "dashboard",
      render: ({ data }) => <Dashboard data={data} />,
    })

    // Register sidebar slot
    const unregisterSidebar = context.ui.slot({
      append: "sidebar.content",
      render: ({ sessionID }) => <SidebarSessionInfo sessionID={sessionID} />,
    })

    // Register status in home footer
    const unregisterStatus = context.ui.slot({
      append: "home.footer.status",
      render: () => <SyncStatus />,
    })

    // Register keymap layer
    const unregisterKeymap = context.keymap.layer(() => ({
      mode: "global",
      priority: 10,
      commands: [
        {
          id: "acme.dashboard",
          title: "Open Acme Dashboard",
          group: "Acme",
          bind: "ctrl+shift+a",
          palette: true,
          slash: { name: "acme", aliases: ["dashboard"] },
          run: () => context.ui.router.navigate({ 
            type: "plugin", 
            name: "dashboard", 
            data: { title: "Acme Dashboard" } 
          }),
        },
        {
          id: "acme.panel",
          title: "Open Acme Panel",
          slash: { name: "acme-panel" },
          run: () => context.ui.panel.open("acme.panel"),
        },
      ],
      bindings: ["acme.dashboard"],
    }))

    // Register session panel
    const unregisterPanel = context.ui.slot({
      append: "session.panel",
      render: (panel) => (
        <Show when={panel.name === "acme.panel"}>
          <AcmePanel panel={panel} />
        </Show>
      ),
    })

    // Cleanup
    return () => {
      unregisterRoute()
      unregisterSidebar()
      unregisterStatus()
      unregisterKeymap()
      unregisterPanel()
    }
  },
})

// Components using usePlugin()
function Dashboard(props: { data?: { title?: string } }) {
  const context = usePlugin()
  return (
    <box>
      <text fg={context.theme.accent.base}>{props.data?.title ?? "Acme"}</text>
      <text fg={context.theme.text.muted}>Version: {context.app.version}</text>
    </box>
  )
}

function SidebarSessionInfo(props: { sessionID: string }) {
  const context = usePlugin()
  const session = context.data.session.get(props.sessionID)
  return session ? (
    <text fg={context.theme.text.subtle}>{session.title}</text>
  ) : null
}

function SyncStatus() {
  const context = usePlugin()
  return <text fg={context.theme.accent.base}>SYNCED</text>
}

function AcmePanel(props: { panel: any }) {
  const context = usePlugin()
  
  context.keymap.layer(() => ({
    commands: [{
      id: "acme.panel.fullscreen",
      bind: "f",
      run: props.panel.toggleFullscreen,
    }],
  }))
  
  return (
    <box>
      <text fg={context.theme.text.base}>Acme Panel for {props.panel.sessionID}</text>
      <text fg={context.theme.text.muted}>Press 'f' for fullscreen</text>
    </box>
  )
}
```

---

## 11. Key Differences Summary

| Aspect | V1 | V2 |
|--------|-----|-----|
| **Import** | `@opencode-ai/plugin` | `@opencode/plugin` (server) / `@opencode/plugin/tui` (CLI) |
| **Entrypoint** | `async ({ directory, project, client }) => ({ ... })` | `Plugin.define({ id, setup(ctx) { ... } })` |
| **Routes** | `api.route.register()` | `context.ui.router.register()` |
| **Slots** | `api.slots.register()` | `context.ui.slot({ append/prepend/replace: "location", render })` |
| **Commands** | `api.command.register()` | `context.keymap.layer({ commands: [...] })` |
| **Keymaps** | `api.keymap.registerLayer()` | `context.keymap.layer({ commands, bindings })` |
| **Dialogs** | `api.dialog.*` | `context.ui.dialog.*` |
| **Toasts** | `api.toast.*` | `context.ui.toast.*` |
| **Theme** | `context.theme` | `context.theme` (same) |
| **Storage** | `context.storage` | `context.storage.store()` / `context.storage.memory()` (CLI) |
| **Components** | Custom renderer | SolidJS + OpenTUI |
| **Context in JSX** | N/A | `usePlugin()` hook |

---

## 12. Resources

- **Official CLI Plugin Docs**: https://opencode.ai/v2/docs/build/plugins/cli
- **Migration Guide**: https://opencode.ai/v2/docs/build/plugins/migrate-v1
- **Plugin Configuration**: https://opencode.ai/v2/docs/cli/plugins
- **Effect Plugin API**: https://opencode.ai/v2/docs/build/plugins/effect
- **NPM Package**: https://www.npmjs.com/package/@opencode/plugin