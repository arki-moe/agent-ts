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

describe("Agent", () => {
  beforeEach(() => {
    openaiAdapterImpl = async () => [];
  });

  it("run appends user message and AI reply to context", async () => {
    openaiAdapterImpl = async () => [{ role: Role.Ai, content: "ok" }];
    const agent = new Agent("openai", { apiKey: "x" });

    const msgs = await agent.run("hi");

    expect(msgs).toHaveLength(1);
    expect(agent.context).toHaveLength(2);
    expect(agent.context[0]).toEqual({ role: Role.User, content: "hi" });
    expect(agent.context[1]).toEqual({ role: Role.Ai, content: "ok" });
  });

  it("run once keeps AI reply but omits user message from context", async () => {
    let sawUserInAdapter = false;
    openaiAdapterImpl = async (_config, context) => {
      const ctx = Array.isArray(context) ? (context as { role: string; content?: string }[]) : [];
      sawUserInAdapter = ctx.some((m) => m.role === Role.User && m.content === "hint");
      return [{ role: Role.Ai, content: "ok" }];
    };
    const agent = new Agent("openai", { apiKey: "x" });

    const msgs = await agent.run("hint", { once: true });

    expect(sawUserInAdapter).toBe(true);
    expect(msgs).toHaveLength(1);
    expect(agent.context).toHaveLength(1);
    expect(agent.context[0]).toEqual({ role: Role.Ai, content: "ok" });
  });

  it("run appends tool results to context", async () => {
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
          argsText: '{"a":1,"b":2}',
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

    const all = await agent.run("add");

    expect(all.find((m) => m.role === Role.ToolCall)).toBeTruthy();
    expect(all.find((m) => m.role === Role.ToolResult)).toBeTruthy();
    expect(all.find((m) => m.role === Role.Ai)).toBeTruthy();
    expect(agent.context.find((m) => m.role === Role.ToolCall)).toBeTruthy();
    expect(agent.context.find((m) => m.role === Role.ToolResult)).toBeTruthy();
  });

  it("endCondition in config can stop before tool execution", async () => {
    openaiAdapterImpl = async () => [
      {
        role: Role.ToolCall,
        toolName: "add",
        callId: "1",
        argsText: '{"a":1,"b":2}',
      },
    ];

    const execute = vi.fn(async () => "3");
    const endCondition = vi.fn((_context: unknown, last: { role: string }) => {
      return last.role === Role.ToolCall;
    });

    const agent = new Agent("openai", { apiKey: "x", endCondition });
    agent.registerTool({
      name: "add",
      description: "Add two numbers",
      parameters: { type: "object", properties: {} },
      execute,
    });

    const all = await agent.run("add");

    expect(all).toHaveLength(1);
    expect(all[0].role).toBe(Role.ToolCall);
    expect(execute).not.toHaveBeenCalled();
    expect(endCondition).toHaveBeenCalledTimes(1);
  });

  it("onToolCall and onToolResult hooks are invoked", async () => {
    openaiAdapterImpl = async (_config, context) => {
      const ctx = Array.isArray(context) ? (context as { role: string }[]) : [];
      const last = ctx[ctx.length - 1];
      if (last?.role === Role.ToolResult) {
        return [{ role: Role.Ai, content: "done" }];
      }
      return [
        { role: Role.ToolCall, toolName: "echo", callId: "1", argsText: '{"x":"hi"}' },
      ];
    };

    const onToolCall = vi.fn();
    const onToolResult = vi.fn();

    const agent = new Agent("openai", { apiKey: "x", onToolCall, onToolResult });
    agent.registerTool({
      name: "echo",
      description: "Echo",
      parameters: {},
      execute: (args) => (args as { x: string }).x,
    });

    await agent.run("test");

    expect(onToolCall).toHaveBeenCalledTimes(1);
    expect(onToolCall.mock.calls[0][0].role).toBe(Role.ToolCall);
    expect(onToolCall.mock.calls[0][1]).toEqual({ x: "hi" });
    expect(onToolResult).toHaveBeenCalledTimes(1);
    expect(onToolResult.mock.calls[0][0].role).toBe(Role.ToolResult);
  });

  it("onToolCall can mutate args", async () => {
    openaiAdapterImpl = async (_config, context) => {
      const ctx = Array.isArray(context) ? (context as { role: string }[]) : [];
      const last = ctx[ctx.length - 1];
      if (last?.role === Role.ToolResult) {
        return [{ role: Role.Ai, content: "done" }];
      }
      return [
        { role: Role.ToolCall, toolName: "echo", callId: "1", argsText: '{"x":"hi"}' },
      ];
    };

    const onToolCall = vi.fn((_message, args) => {
      (args as { x: string }).x = "changed";
    });

    const agent = new Agent("openai", { apiKey: "x", onToolCall });
    agent.registerTool({
      name: "echo",
      description: "Echo",
      parameters: {},
      execute: (args) => (args as { x: string }).x,
    });

    const all = await agent.run("test");
    const toolResult = all.find((m) => m.role === Role.ToolResult);

    expect(onToolCall).toHaveBeenCalledTimes(1);
    expect(toolResult?.content).toBe("changed");
  });

  it("onToolCall can skip tool execution", async () => {
    openaiAdapterImpl = async (_config, context) => {
      const ctx = Array.isArray(context) ? (context as { role: string }[]) : [];
      const last = ctx[ctx.length - 1];
      if (last?.role === Role.ToolCall) {
        return [{ role: Role.Ai, content: "skipped" }];
      }
      return [
        { role: Role.ToolCall, toolName: "echo", callId: "1", argsText: '{"x":"hi"}' },
      ];
    };

    const onToolCall = vi.fn(() => false);
    const onToolResult = vi.fn();
    const execute = vi.fn(() => "hi");

    const agent = new Agent("openai", { apiKey: "x", onToolCall, onToolResult });
    agent.registerTool({
      name: "echo",
      description: "Echo",
      parameters: {},
      execute,
    });

    const all = await agent.run("test");

    expect(all.find((m) => m.role === Role.ToolResult)).toBeFalsy();
    expect(execute).not.toHaveBeenCalled();
    expect(onToolResult).not.toHaveBeenCalled();
  });

  it("executes multiple tool calls in parallel", async () => {
    const order: string[] = [];

    openaiAdapterImpl = async (_config, context) => {
      const ctx = Array.isArray(context) ? (context as { role: string }[]) : [];
      if (ctx.some((m) => m.role === Role.ToolResult)) {
        return [{ role: Role.Ai, content: "done" }];
      }
      return [
        { role: Role.ToolCall, toolName: "slow", callId: "1", argsText: '{"id":"a"}' },
        { role: Role.ToolCall, toolName: "slow", callId: "2", argsText: '{"id":"b"}' },
      ];
    };

    const agent = new Agent("openai", { apiKey: "x" });
    agent.registerTool({
      name: "slow",
      description: "Slow tool",
      parameters: {},
      execute: async (args) => {
        const { id } = args as { id: string };
        order.push(`start:${id}`);
        await new Promise((r) => setTimeout(r, 50));
        order.push(`end:${id}`);
        return id;
      },
    });

    await agent.run("go");

    // Both tools should start before either finishes
    expect(order[0]).toBe("start:a");
    expect(order[1]).toBe("start:b");
  });

});
