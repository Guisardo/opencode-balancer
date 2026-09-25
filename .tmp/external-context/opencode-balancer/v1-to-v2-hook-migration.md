# OpenCode V1 → V2 Plugin Hook Migration Mapping

**Source Documentation:**
- [V1 Migration Guide](https://opencode.ai/v2/docs/build/plugins/migrate-v1)
- [V2 Plugin API](https://opencode.ai/v2/docs/build/plugins)
- [@opencode/plugin package types](https://github.com/anomalyco/opencode/blob/dev/packages/plugin/src/index.ts)

---

## Overview

This document maps every V1 hook used by `opencode-balancer` to its V2 equivalent, including exact API signatures, mutable event shapes, and provider-scoping options.

### V1 → V2 Architecture Shift

| Aspect | V1 | V2 |
|--------|-----|-----|
| **Entrypoint** | `async (input, options) => ({ hooks, tools, dispose })` | `Plugin.define({ id, async setup(ctx) })` |
| **Hook Registration** | Return object with string keys | `await ctx.domain.hook("name", callback, options?)` |
| **Event Shape** | Separate `input` and `output` objects | Single mutable `event` object |
| **Tool Registration** | `tool: { name: tool({...}) }` | `await ctx.tool.transform(editor => editor.add({...}))` |
| **Config/Provider** | `config` and `provider` hooks | Domain transforms (`ctx.agent.transform`, `ctx.provider.transform`, `ctx.model.transform`) |
| **Cleanup** | `dispose()` in returned object | Return cleanup function from `setup()` |

---

## Hook Migration Table

### 1. `chat.headers` → `ctx.session.hook("model.request", ...)` or `ctx.session.hook("http.request", ...)`

#### V1 Signature
```typescript
"chat.headers": (
  input: { 
    sessionID: string; 
    agent: string; 
    model: Model; 
    provider: ProviderContext; 
    message: UserMessage 
  },
  output: { headers: Record<string, string> }
) => Promise<void>
```

#### V2 Equivalents

**Option A: Model Request Headers (Recommended for provider-specific headers)**
```typescript
await ctx.session.hook(
  "model.request",
  (event) => {
    event.headers["x-plugin"] = "review";
    event.headers["x-custom-header"] = "value";
  },
  { providerID: "anthropic" } // Optional: scope to specific provider
);
```

**Option B: Native HTTP Request (For raw HTTP layer manipulation)**
```typescript
await ctx.session.hook("http.request", (event) => {
  event.request.headers.set("x-session-id", event.sessionID);
  if (event.kind === "title") {
    event.request.headers.set("x-priority", "background");
  }
});
```

#### V2 Event Shapes

**SessionModelRequestHook** (`model.request`):
```typescript
interface SessionModelRequestHook {
  readonly sessionID: string;
  readonly agent: string;
  readonly model: { providerID: string; id: string; variant?: string };
  readonly kind: "primary" | "compaction" | "title" | "generate";
  headers: Record<string, string>;
}
```

**SessionHttpRequestHook** (`http.request`):
```typescript
interface SessionHttpRequestHook {
  readonly sessionID: string;
  readonly agent: string;
  readonly model: { providerID: string; id: string; variant?: string };
  readonly kind: "primary" | "compaction" | "title" | "generate";
  request: Request; // Mutable native Request object
}
```

#### Provider Scoping
```typescript
// Scope to specific provider
await ctx.session.hook("model.request", callback, { providerID: "anthropic" });
await ctx.session.hook("model.request", callback, { providerID: "openai" });
await ctx.session.hook("http.request", callback, { providerID: "azure" });
```

---

### 2. `chat.message` → `ctx.session.hook("prompt", ...)` or `ctx.session.hook("context", ...)`

#### V1 Signature
```typescript
"chat.message": (
  input: {
    sessionID: string;
    agent?: string;
    model?: { providerID: string; modelID: string };
    messageID?: string;
    variant?: string;
  },
  output: { message: UserMessage; parts: Part[] }
) => Promise<void>
```

#### V2 Equivalents

**Option A: Prompt Admission Hook (Runs once during user prompt admission)**
```typescript
await ctx.session.hook("prompt", (event) => {
  // Modify the user prompt before it enters the session
  event.prompt.text = event.prompt.text.replaceAll("secret", "[redacted]");
  
  // Add files/attachments
  event.prompt.files ??= [];
  event.prompt.files.push({ uri: "file:///project/policy.md" });
  
  // Add metadata
  event.metadata = { ...event.metadata, source: "balancer-policy" };
  
  // Change delivery mode
  event.delivery = "queue"; // or "steer" (default)
});
```

**Option B: Context Hook (Runs before EVERY model request)**
```typescript
await ctx.session.hook("context", (event) => {
  // Modify system instructions, messages, tools, options
  event.system.push({ type: "text", text: "Balancer context injection" });
  event.options.temperature = 0.2;
  event.options.maxTokens = 8000;
  
  // Remove tools
  delete event.tools.write;
});
```

#### V2 Event Shapes

**SessionPrompt** (`prompt`):
```typescript
interface SessionPrompt {
  readonly sessionID: string;
  readonly messageID: string;
  prompt: {
    text: string;
    files: { uri: string; mention?: { offset: number; length: number } }[];
    agents: string[];
    skills: string[];
  };
  metadata: Record<string, unknown>;
  delivery: "steer" | "queue";
}
```

**SessionContextHook** (`context`):
```typescript
interface SessionContextHook {
  readonly sessionID: string;
  readonly agent: string;
  readonly model: { providerID: string; id: string; variant?: string };
  readonly kind: "primary" | "compaction" | "title" | "generate";
  system: { type: "text"; text: string }[];
  messages: readonly SessionMessageInfo[];
  tools: Record<string, ToolInfo>;
  options: Record<string, unknown>; // Generation options
}
```

#### Key Differences
| V1 `chat.message` | V2 `prompt` | V2 `context` |
|-------------------|-------------|--------------|
| Runs per message | Runs once per user prompt admission | Runs before EVERY model request |
| Can modify message content | Can modify prompt text, files, skills | Can modify system, messages, tools, options |
| No provider scoping | No provider scoping | **Supports provider scoping** |

#### Provider Scoping (context hook only)
```typescript
await ctx.session.hook(
  "context",
  (event) => {
    event.options.reasoningEffort = "high"; // OpenAI Responses
  },
  { providerID: "openai" }
);
```

---

### 3. `command.execute.before` (for `/balancer` command) → Command Transform or Prompt Hook

#### V1 Signature
```typescript
"command.execute.before": (
  input: { command: string; sessionID: string; arguments: string },
  output: { parts: Part[] }
) => Promise<void>
```

#### V2 Equivalents

**Option A: Command Transform (If plugin OWNS the command)**
```typescript
await ctx.command.transform((editor) => {
  editor.add({
    name: "balancer",
    description: "Balance workload across models",
    execute: async ({ sessionID, prompt, delivery }) => {
      // Modify the prompt before it's submitted
      await ctx.session.prompt({
        ...prompt,
        sessionID,
        text: `[Balancer] ${prompt.text}`,
        delivery,
      });
    },
  });
});
```

**Option B: Prompt Hook (If intent is to modify prompts from ANY source)**
```typescript
await ctx.session.hook("prompt", (event) => {
  // Check if this prompt originated from the balancer command
  if (event.metadata?.command === "balancer") {
    event.prompt.text = `[Balancer Enhanced] ${event.prompt.text}`;
  }
});
```

#### V2 Event Shape (CommandInvocation)
```typescript
interface CommandInvocation {
  sessionID: string;
  prompt: PromptInput; // { text, files, agents, skills }
  delivery: "steer" | "queue";
}
```

#### Decision Guide
| Use Case | V2 Approach |
|----------|-------------|
| Plugin defines `/balancer` command | `ctx.command.transform()` |
| Modify all prompts (including from commands) | `ctx.session.hook("prompt")` |
| Modify model-visible context for balancer flows | `ctx.session.hook("context")` with provider scoping |

---

### 4. `experimental.chat.messages.transform` → `ctx.session.hook("context", ...)`

#### V1 Signature
```typescript
"experimental.chat.messages.transform": (
  input: {},
  output: {
    messages: {
      info: Message;
      parts: Part[];
    }[];
  }
) => Promise<void>
```

#### V2 Equivalent
```typescript
await ctx.session.hook("context", (event) => {
  // event.messages contains the full transcript
  // event.system contains system instructions
  
  // Example: Inject balancer context into messages
  event.messages = event.messages.map((msg) => {
    if (msg.role === "user" && msg.content.includes("balance")) {
      return {
        ...msg,
        content: `[Balancer Context] ${msg.content}`,
      };
    }
    return msg;
  });
  
  // Or add system instructions
  event.system.push({
    type: "text",
    text: "Apply balancer routing rules for model selection",
  });
});
```

#### V2 Event Shape (SessionContextHook)
```typescript
interface SessionContextHook {
  readonly sessionID: string;
  readonly agent: string;
  readonly model: { providerID: string; id: string; variant?: string };
  readonly kind: "primary" | "compaction" | "title" | "generate";
  system: { type: "text"; text: string }[];
  messages: readonly SessionMessageInfo[]; // Mutable array
  tools: Record<string, ToolInfo>;
  options: Record<string, unknown>;
}
```

#### SessionMessageInfo Structure
```typescript
interface SessionMessageInfo {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string | readonly Part[];
  // ... other fields
}
```

---

### 5. `config` hook → Domain Transforms

#### V1 Signature
```typescript
config?: (input: Config) => Promise<void>
```

#### V2 Equivalents
**No single `config` hook in V2.** Use domain-specific transforms:

| Config Domain | V2 Transform |
|---------------|--------------|
| Agents | `ctx.agent.transform()` |
| Providers | `ctx.provider.transform()` |
| Models | `ctx.model.transform()` |
| Commands | `ctx.command.transform()` |
| Integrations | `ctx.integration.transform()` |
| MCP Servers | `ctx.mcp.transform()` |
| References | `ctx.reference.transform()` |
| Skills | `ctx.skill.transform()` |
| Tools | `ctx.tool.transform()` |
| VCS | `ctx.vcs.transform()` |
| Worktrees | `ctx.worktree.transform()` |
| Websearch | `ctx.websearch.transform()` |

#### Example: Migrate Config Modifications
```typescript
// V1: Modify config globally
config: async (config) => {
  config.agent = "custom-agent";
  config.model.provider = "anthropic";
}

// V2: Use domain transforms
async setup(ctx) {
  // Modify agents
  await ctx.agent.transform((editor) => {
    editor.default("custom-agent");
    editor.update("custom-agent", (agent) => {
      agent.description = "Balancer agent";
    });
  });

  // Modify providers
  await ctx.provider.transform((editor) => {
    editor.update("anthropic", (provider) => {
      provider.headers = { ...provider.headers, "x-balancer": "true" };
    });
  });

  // Modify models
  await ctx.model.transform((editor) => {
    editor.default.set("anthropic", "claude-sonnet-4-5");
    editor.list().forEach((model) => {
      if (!model.capabilities.tools) {
        editor.remove(model.providerID, model.id);
      }
    });
  });
}
```

#### V2 Transform Pattern
```typescript
// All transforms are SYNCHRONOUS
await ctx.domain.transform((editor) => {
  // editor.list() - read current state
  // editor.get(id) - get specific item
  // editor.add(item) - add new item
  // editor.update(id, fn) - mutate item
  // editor.remove(id) - remove item
  // editor.default.set(id) - set default
});

// Reload when external data changes
await ctx.domain.reload();
```

---

### 6. Tool Registration: `tool: { balancer_command: tool(...) }` → `ctx.tool.transform(...)`

#### V1 Signature
```typescript
import { tool } from "@opencode-ai/plugin";

tool: {
  balancer_command: tool({
    description: "Execute balancer command",
    args: { 
      action: tool.schema.string(),
      model: tool.schema.string().optional()
    },
    async execute(args) {
      return `Balancer: ${args.action}`;
    },
  }),
}
```

#### V2 Equivalent
```typescript
await ctx.tool.transform((editor) => {
  // Optional: Define namespace
  editor.namespace({
    name: "balancer",
    description: "Model balancing tools",
  });

  editor.add({
    name: "balancer_command",
    description: "Execute balancer command",
    input: {
      type: "object",
      properties: {
        action: { type: "string" },
        model: { type: "string" },
      },
      required: ["action"],
      additionalProperties: false,
    },
    options: { 
      namespace: "balancer", 
      codemode: true 
    },
    async execute(input, context) {
      await context.progress({ status: "balancing" });
      return { content: `Balancer: ${(input as { action: string }).action}` };
    },
  });
});
```

#### V2 Tool Definition Schema
```typescript
interface ToolInfo {
  name: string;
  description: string;
  input: {
    type: "object";
    properties: Record<string, JSONSchema>;
    required: string[];
    additionalProperties: false;
  };
  options?: {
    namespace?: string;
    codemode?: boolean;
  };
  execute: (input: unknown, context: ToolExecutionContext) => Promise<ToolResult>;
}

interface ToolExecutionContext {
  signal: AbortSignal;
  progress: (update: { status: string }) => void;
}

interface ToolResult {
  content: string | ToolContent[];
}

interface ToolContent {
  type: "text" | "file" | "json";
  text?: string;
  // ... other content types
}
```

#### Update/Remove Tools
```typescript
await ctx.tool.transform((editor) => {
  // Update existing tool (use effective ID with namespace)
  editor.update("balancer_balancer_command", (tool) => {
    tool.description = "Updated description";
  });

  // Remove tool
  editor.remove("balancer_obsolete_tool");
});
```

#### Reload Tools
```typescript
// When external tool definitions change
await ctx.tool.reload();
```

---

## Complete V1→V2 Mapping Summary for opencode-balancer

| V1 Hook | V2 API | Scope | Notes |
|---------|--------|-------|-------|
| `chat.headers` | `ctx.session.hook("model.request")` | Provider | Use for semantic headers |
| `chat.headers` | `ctx.session.hook("http.request")` | Provider | Use for raw HTTP manipulation |
| `chat.message` | `ctx.session.hook("prompt")` | Session | Runs once at prompt admission |
| `chat.message` | `ctx.session.hook("context")` | Provider | Runs before every model request |
| `command.execute.before` | `ctx.command.transform()` | Command | If plugin owns the command |
| `command.execute.before` | `ctx.session.hook("prompt")` | Session | If modifying all command prompts |
| `experimental.chat.messages.transform` | `ctx.session.hook("context")` | Provider | Full transcript access |
| `experimental.chat.system.transform` | `ctx.session.hook("context")` | Provider | Edit `event.system` |
| `config` | `ctx.agent/provider/model/...transform()` | Domain | Per-domain transforms |
| `tool` map | `ctx.tool.transform()` | Tool | Synchronous editor API |
| `tool.execute.before` | `ctx.tool.hook("execute.before")` | Tool | Tool execution interception |
| `tool.execute.after` | `ctx.tool.hook("execute.after")` | Tool | Post-execution modification |
| `permission.ask` | `ctx.permission.hook("evaluate")` | Session | Permission decisions |
| `shell.env` | `ctx.shell.hook("create.before")` | Shell | Environment variables |
| `auth` | `ctx.integration.transform()` | Integration | Auth methods |
| `provider` | `ctx.provider.transform()` | Provider | Provider definitions |
| `dispose` | Return cleanup fn from `setup()` | Plugin | Auto-cleanup |
| `event` | `ctx.event.subscribe()` | Event | Async iteration |

---

## Provider Scoping Reference

### Hooks Supporting Provider Scoping
```typescript
// These hooks accept optional third argument: { providerID: string }
await ctx.session.hook("context", callback, { providerID: "anthropic" });
await ctx.session.hook("model.request", callback, { providerID: "openai" });
await ctx.session.hook("http.request", callback, { providerID: "azure" });
await ctx.session.hook("http.response", callback, { providerID: "azure" });
await ctx.session.hook("experimental.ws.handshake", callback, { providerID: "openai" });
await ctx.session.hook("experimental.ws.send", callback, { providerID: "openai" });
await ctx.session.hook("experimental.ws.receive", callback, { providerID: "openai" });
await ctx.session.hook("retry", callback, { providerID: "anthropic" });
```

### Hooks WITHOUT Provider Scoping
```typescript
// These run BEFORE provider resolution
await ctx.session.hook("prompt", callback); // No scoping
await ctx.session.hook("compaction", callback); // No scoping
await ctx.session.hook("generate", callback); // No scoping
await ctx.session.hook("title", callback); // No scoping
```

---

## V2 Plugin Template for opencode-balancer

```typescript
// .opencode/plugins/opencode-balancer/index.ts
import { Plugin } from "@opencode/plugin";

export default Plugin.define({
  id: "opencode-balancer",
  
  async setup(ctx) {
    // 1. Register tools
    await ctx.tool.transform((editor) => {
      editor.namespace({ name: "balancer", description: "Model balancing tools" });
      editor.add({
        name: "balancer_command",
        description: "Execute balancer routing",
        input: {
          type: "object",
          properties: {
            action: { type: "string" },
            model: { type: "string" },
          },
          required: ["action"],
          additionalProperties: false,
        },
        options: { namespace: "balancer", codemode: true },
        async execute(input, context) {
          // Implementation
          return { content: "Balancer executed" };
        },
      });
    });

    // 2. Prompt admission hook (replaces chat.message)
    await ctx.session.hook("prompt", (event) => {
      // Inject balancer context at prompt admission
      if (event.prompt.text.includes("/balancer")) {
        event.prompt.text = `[Balancer Active] ${event.prompt.text}`;
        event.metadata = { ...event.metadata, balancer: true };
      }
    });

    // 3. Context hook for model requests (replaces chat.headers, chat.params, experimental.chat.messages.transform)
    await ctx.session.hook("context", (event) => {
      // Inject system instructions
      event.system.push({
        type: "text",
        text: "Apply model balancing rules per configuration",
      });

      // Set generation options
      event.options.temperature = 0.3;
      event.options.maxTokens = 8000;

      // Modify tools available
      // delete event.tools.some_tool;
    }, { providerID: "anthropic" }); // Optional scoping

    // 4. Model request headers (replaces chat.headers)
    await ctx.session.hook("model.request", (event) => {
      event.headers["x-balancer"] = "enabled";
      event.headers["x-balancer-version"] = "2.0";
    }, { providerID: "anthropic" });

    // 5. Command transform (replaces command.execute.before for /balancer)
    await ctx.command.transform((editor) => {
      editor.add({
        name: "balancer",
        description: "Configure model balancing",
        execute: async ({ sessionID, prompt, delivery }) => {
          await ctx.session.prompt({
            ...prompt,
            sessionID,
            text: `[Balancer Config] ${prompt.text}`,
            delivery,
          });
        },
      });
    });

    // 6. Domain transforms (replaces config hook)
    await ctx.model.transform((editor) => {
      // Filter/enable models based on balancer config
      editor.list().forEach((model) => {
        if (shouldDisableModel(model)) {
          editor.remove(model.providerID, model.id);
        }
      });
    });

    // 7. Cleanup function
    return () => {
      // Cleanup timers, connections, etc.
    };
  },
});
```

---

## Key Migration Checklist

- [ ] Replace plugin entrypoint with `Plugin.define({ id, setup })`
- [ ] Move all hook registrations into `setup(ctx)`
- [ ] Convert `chat.headers` → `ctx.session.hook("model.request")` or `http.request`
- [ ] Convert `chat.message` → `ctx.session.hook("prompt")` or `ctx.session.hook("context")`
- [ ] Convert `command.execute.before` → `ctx.command.transform()` or `prompt` hook
- [ ] Convert `experimental.chat.messages.transform` → `ctx.session.hook("context")`
- [ ] Convert `config` hook → domain-specific transforms
- [ ] Convert `tool` map → `ctx.tool.transform()` with JSON Schema
- [ ] Replace `dispose()` with cleanup function returned from `setup()`
- [ ] Replace `event` hook with `ctx.event.subscribe()`
- [ ] Add provider scoping where needed (`{ providerID: "..." }`)
- [ ] Test each hook registration with `ctx.domain.reload()` after config changes
- [ ] Verify plugin appears in `ctx.plugin.list()`

---

## Official Documentation Links

- [V1 Migration Guide](https://opencode.ai/v2/docs/build/plugins/migrate-v1)
- [V2 Plugin API](https://opencode.ai/v2/docs/build/plugins)
- [Session Hooks Reference](https://opencode.ai/v2/docs/build/plugins#sessions)
- [Transforms Reference](https://opencode.ai/v2/docs/build/plugins#transforms)
- [Tools Reference](https://opencode.ai/v2/docs/build/plugins#tools)
- [Commands Reference](https://opencode.ai/v2/docs/build/plugins#commands)