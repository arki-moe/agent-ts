import { beforeEach, describe, expect, it, vi } from "vitest";
import { Role } from "../src/types";

let openaiAdapterImpl: (...args: unknown[]) => Promise<unknown[]> = async () => [];

vi.mock("../src/adapter/openai", () => ({
  openaiAdapter: (...args: unknown[]) => openaiAdapterImpl(...args),
}));

vi.mock("../src/adapter/openrouter", () => ({
  openrouterAdapter: () => {
    throw new Error("openrouter adapter mocked");
  },
}));

import { Agent } from "../src/index";

describe("Agent autoAppend parameter", () => {
  beforeEach(() => {
    openaiAdapterImpl = async () => [];
  });

  it("step appends messages by default", async () => {
    openaiAdapterImpl = async () => [{ role: Role.Ai, content: "ok" }];
    const agent = new Agent("openai", { apiKey: "x" });

    const msgs = await agent.step({ role: Role.User, content: "hi" });

    expect(msgs).toHaveLength(1);
    expect(agent.context).toHaveLength(2);
    expect(agent.context[0]).toEqual({ role: Role.User, content: "hi" });
    expect(agent.context[1]).toEqual({ role: Role.Ai, content: "ok" });
  });

  it("step can avoid appending to context", async () => {
    openaiAdapterImpl = async () => [{ role: Role.Ai, content: "ok" }];
    const agent = new Agent("openai", { apiKey: "x" });
    agent.context.push({ role: Role.System, content: "sys" });

    const msgs = await agent.step({ role: Role.User, content: "hi" }, false);

    expect(msgs).toHaveLength(1);
    expect(agent.context).toHaveLength(1);
    expect(agent.context[0]).toEqual({ role: Role.System, content: "sys" });
  });

  it("run can avoid appending to context while using tools", async () => {
    openaiAdapterImpl = async (_config, context) => {
      const ctx = Array.isArray(context) ? (context as { role: string }[]) : [];
      const last = ctx[ctx.length - 1];
      if (last?.role === Role.ToolResult) {
        return [{ role: Role.Ai, content: "done" }];
      }
      return [
        {
          role: Role.ToolCall,
          toolName: "add",
          callId: "1",
          argsText: "{\"a\":1,\"b\":2}",
        },
      ];
    };

    const agent = new Agent("openai", { apiKey: "x" });
    agent.context.push({ role: Role.System, content: "sys" });
    agent.registerTool({
      name: "add",
      description: "Add two numbers",
      parameters: { type: "object", properties: {} },
      execute: async (args) => {
        const { a, b } = args as { a: number; b: number };
        return String(a + b);
      },
    });

    const all = await agent.run({ role: Role.User, content: "add" }, false);

    expect(all.find((m) => m.role === Role.ToolCall)).toBeTruthy();
    expect(all.find((m) => m.role === Role.ToolResult)).toBeTruthy();
    expect(all.find((m) => m.role === Role.Ai)).toBeTruthy();
    expect(agent.context).toHaveLength(1);
    expect(agent.context[0]).toEqual({ role: Role.System, content: "sys" });
  });
});
