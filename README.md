# agent-ts

[![npm](https://img.shields.io/npm/v/@arki-moe/agent-ts.svg)](https://www.npmjs.com/package/@arki-moe/agent-ts) [![npm](https://img.shields.io/npm/dm/@arki-moe/agent-ts.svg)](https://www.npmjs.com/package/@arki-moe/agent-ts)

Minimal Agent library, zero dependencies

## Usage Example

```ts
import { Agent, Role, type Tool } from "@arki-moe/agent-ts";

const getTimeTool: Tool = {
  name: "get_time",
  description: "Get the current time in ISO format",
  parameters: { type: "object", properties: {} },
  execute: () => new Date().toISOString(),
};

const agent = new Agent("openai", {
  apiKey: "sk-...",
  model: "gpt-5-nano",
  system: "You are a helpful assistant. Reply concisely.",
  onStream: (textDelta) => {
    process.stdout.write(textDelta);
  },
  onToolCall: (message, args) => {
    console.log("tool call:", message);
    console.log("tool args:", args);
  },
  onToolResult: (msg) => console.log("tool result:", msg),
});
agent.registerTool(getTimeTool);

// run: Executes tool chain automatically, returns new messages, context is maintained automatically
const msgs = await agent.run("What time is it?");
console.log(msgs);

// context is a public property that can be read directly
console.log(agent.context);
```

## Supported Adapters

| Adapter | Required | Optional |
|---------|----------|----------|
| `openai` | `apiKey` (or `OPENAI_API_KEY` env), `model` | `system`, `baseUrl` |
| `openrouter` | `apiKey` (or `OPENROUTER_API_KEY` env), `model` | `system`, `baseUrl`, `httpReferer`, `title` |

When `apiKey` is not provided in config, adapters read from the corresponding environment variable. An error is thrown only when both are missing.

## API

- `Agent(adapterName, config)` - Create Agent
- `agent.context` - Public property, complete conversation history
- `agent.registerTool(tool)` - Register tool
- `agent.run(message)` - Execute tool chain automatically, returns all new `Message[]`
- `agent.fork()` - Create a new agent with a copied context

### Config

| Field | Type | Description |
|-------|------|-------------|
| `apiKey` | `string` | API key (or use env var) |
| `model` | `string` | Model name |
| `system` | `string` | Optional system prompt |
| `endCondition` | `(context, last) => boolean` | Stop condition for `run`. Defaults to `last.role === Role.Ai` |
| `onStream` | `(textDelta: string) => void \| Promise<void>` | Stream hook for AI text only. When provided, adapters use SSE streaming and still return the final `Message[]`. |
| `onToolCall` | `(message, args) => boolean \| void \| Promise<boolean \| void>` | Called before each tool execution; return `false` to skip tool execution and `onToolResult` |
| `onToolResult` | `(message) => void \| Promise<void>` | Called after each tool execution (`message.role === Role.ToolResult`) |

`agent.run` always appends new messages to `agent.context`. Multiple tool calls in a single model response are executed in parallel.

`onToolCall` receives parsed JSON args and can mutate them before execution. Returning `false` skips the tool call and does not emit a `ToolResult` message.

`agent.fork()` shallow-copies the context array, but message objects are shared. This means:
- Shallow copy: `forked.context !== agent.context`, so pushing new messages does not affect the other agent.
- Shared messages: modifying a message object in one context will be visible in the other.

Example:

```ts
const forked = agent.fork();
forked.context.push({ role: Role.User, content: "hi" });
// agent.context length is unchanged

forked.context[0].content = "changed";
// agent.context[0].content is also "changed" because messages are shared
```

## Scripts

| Command | Description |
|---------|--------------|
| `pnpm run build` | Compile TypeScript to `dist/` |
| `pnpm run check` | Type check (no emit) |
| `pnpm test` | Run tests (API key read from env var for real API tests) |
