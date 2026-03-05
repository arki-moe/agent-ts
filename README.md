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
  system: "You are a helpful assistant. Reply concisely.", // optional: system role
});
agent.registerTool(getTimeTool);

// run: Executes tool chain automatically, returns new messages, context is maintained automatically
const msgs = await agent.run({ role: Role.User, content: "What time is it?" });
console.log(msgs);

// step: Single-step inference, returns new messages from the model
const msgs2 = await agent.step({ role: Role.User, content: "Hello" });
console.log(msgs2);

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

- `Agent(adapterName, config)` - Create Agent, config contains `apiKey`, `model`, `system` (optional), etc.
- `agent.context` - Public property, complete conversation history
- `agent.registerTool(tool)` - Register tool
- `agent.step(message?)` - Call model once, returns new `Message[]`
- `agent.run(message, endCondition?)` - Execute tool chain automatically, returns all new `Message[]`
- `agent.fork()` - Create a new agent with a copied context

`agent.step` and `agent.run` always append new messages to `agent.context`.
`endCondition` receives `(context, last)` and stops the run when it returns `true`. Defaults to `last.role === Role.Ai`.

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
