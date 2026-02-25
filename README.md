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
| `openai` | `apiKey`, `model` | `system`, `baseUrl` |
| `openrouter` | `apiKey`, `model` | `system`, `baseUrl`, `httpReferer`, `title` |

## API

- `Agent(adapterName, config)` - Create Agent, config contains `apiKey`, `model`, `system` (optional), etc.
- `agent.context` - Public property, complete conversation history
- `agent.registerTool(tool)` - Register tool
- `agent.step(message, autoAppend?)` - Call model once, returns new `Message[]`
- `agent.run(message, autoAppend?)` - Execute tool chain automatically, returns all new `Message[]`

`autoAppend` defaults to `true`. When set to `false`, new messages are not appended to `agent.context`.

## Scripts

| Command | Description |
|---------|--------------|
| `pnpm run build` | Compile TypeScript to `dist/` |
| `pnpm run check` | Type check (no emit) |
| `pnpm test` | Run tests (API key read from env var for real API tests) |
