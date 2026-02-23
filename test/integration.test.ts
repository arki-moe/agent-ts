import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Agent, Role } from "../src/index";
import { createMockOpenAIServer } from "./mock-openai-server";

describe("Agent construction and configuration", () => {
  it("throws error when constructing Agent with non-existent adapter name", () => {
    expect(() => new Agent("nonexistent", { apiKey: "x" })).toThrow(
      'Adapter "nonexistent" not found'
    );
  });

  it("constructs normally and verifies initial context is empty", () => {
    const agent = new Agent("openai", {
      apiKey: "x",
      baseUrl: "http://127.0.0.1:0",
    });
    expect(agent.context).toEqual([]);
  });
});

describe("Agent.step() single-step call", () => {
  it("sends user message, receives AI reply, verifies context is updated correctly", async () => {
    const server = createMockOpenAIServer((body) => {
      expect(body.messages?.length).toBeGreaterThan(0);
      expect(body.messages?.[body.messages.length - 1]?.role).toBe("user");
      return { content: "Hello!" };
    });
    const baseUrl = await server.start();

    const agent = new Agent("openai", { apiKey: "test", baseUrl });
    const msgs = await agent.step({ role: Role.User, content: "Hi" });

    expect(msgs).toHaveLength(1);
    expect(msgs[0].role).toBe(Role.Ai);
    expect(msgs[0]).toHaveProperty("content", "Hello!");
    expect(agent.context).toHaveLength(2);
    expect(agent.context[0]).toEqual({ role: Role.User, content: "Hi" });
    expect(agent.context[1]).toEqual({ role: Role.Ai, content: "Hello!" });

    await server.stop();
  });

  it("verifies HTTP request body format is correct (model, messages, tools fields)", async () => {
    let capturedBody: Record<string, unknown> = {};
    const server = createMockOpenAIServer((body) => {
      capturedBody = body;
      return { content: "ok" };
    });
    const baseUrl = await server.start();

    const agent = new Agent("openai", {
      apiKey: "test",
      baseUrl,
      model: "gpt-5-nano",
    });
    agent.registerTool({
      name: "foo",
      description: "bar",
      parameters: {},
      execute: () => "ok",
    });
    await agent.step({ role: Role.User, content: "test" });

    expect(capturedBody).toHaveProperty("model", "gpt-5-nano");
    expect(capturedBody).toHaveProperty("messages");
    expect(Array.isArray(capturedBody.messages)).toBe(true);
    expect(capturedBody).toHaveProperty("tools");
    expect(Array.isArray(capturedBody.tools)).toBe(true);
    expect((capturedBody.tools as unknown[]).length).toBeGreaterThan(0);

    await server.stop();
  });

  it("when config.system is set, first request message is system message", async () => {
    let capturedBody: Record<string, unknown> = {};
    const server = createMockOpenAIServer((body) => {
      capturedBody = body;
      return { content: "ok" };
    });
    const baseUrl = await server.start();

    const agent = new Agent("openai", {
      apiKey: "test",
      baseUrl,
      system: "You are a test assistant.",
    });
    await agent.step({ role: Role.User, content: "Hi" });

    const messages = capturedBody.messages as Array<{ role: string; content: string }>;
    expect(messages[0]?.role).toBe("system");
    expect(messages[0]?.content).toBe("You are a test assistant.");

    await server.stop();
  });
});

describe("Agent.run() simple conversation (no tools)", () => {
  it("sends user message, AI replies directly, run() returns and includes AI message", async () => {
    const server = createMockOpenAIServer(() => ({ content: "Got it!" }));
    const baseUrl = await server.start();

    const agent = new Agent("openai", { apiKey: "test", baseUrl });
    const msgs = await agent.run({ role: Role.User, content: "Hello" });

    expect(msgs).toHaveLength(1);
    expect(msgs[0].role).toBe(Role.Ai);
    expect(msgs[0]).toHaveProperty("content", "Got it!");
    expect(agent.context).toHaveLength(2);

    await server.stop();
  });
});

describe("Agent.run() tool invocation flow", () => {
  it("single tool call: AI requests tool -> tool executes -> AI replies based on result", async () => {
    let callCount = 0;
    const server = createMockOpenAIServer((body) => {
      callCount++;
      const messages = body.messages ?? [];
      const hasToolResult = messages.some(
        (m: { role: string }) => m.role === "tool"
      );
      if (callCount === 1) {
        return {
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: { name: "add", arguments: '{"a":3,"b":5}' },
            },
          ],
        };
      }
      if (hasToolResult) {
        return { content: "3+5=8" };
      }
      return { content: "Thinking..." };
    });
    const baseUrl = await server.start();

    const agent = new Agent("openai", { apiKey: "test", baseUrl });
    agent.registerTool({
      name: "add",
      description: "Add two numbers",
      parameters: { type: "object", properties: { a: {}, b: {} } },
      execute: (args: unknown) => {
        const { a = 0, b = 0 } = (args as { a?: number; b?: number }) ?? {};
        return String(a + b);
      },
    });

    const msgs = await agent.run({
      role: Role.User,
      content: "Calculate 3+5",
    });

    const toolCalls = msgs.filter((m) => m.role === Role.ToolCall);
    const toolResults = msgs.filter((m) => m.role === Role.ToolResult);
    const aiMsgs = msgs.filter((m) => m.role === Role.Ai);

    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].toolName).toBe("add");
    expect(toolCalls[0].argsText).toContain("3");
    expect(toolCalls[0].argsText).toContain("5");

    expect(toolResults).toHaveLength(1);
    expect(toolResults[0].content).toBe("8");
    expect(toolResults[0].isError).toBeFalsy();

    expect(aiMsgs.length).toBeGreaterThanOrEqual(1);
    expect(agent.context.length).toBeGreaterThan(0);

    await server.stop();
  });

  it("multiple parallel tool calls: AI requests multiple tools at once -> all execute -> AI replies", async () => {
    let callCount = 0;
    const server = createMockOpenAIServer((body) => {
      callCount++;
      const messages = body.messages ?? [];
      const hasToolResult = messages.some(
        (m: { role: string }) => m.role === "tool"
      );
      if (callCount === 1) {
        return {
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: { name: "double", arguments: '{"x":2}' },
            },
            {
              id: "call_2",
              type: "function",
              function: { name: "square", arguments: '{"x":3}' },
            },
          ],
        };
      }
      if (hasToolResult) {
        return { content: "Done" };
      }
      return { content: "..." };
    });
    const baseUrl = await server.start();

    const agent = new Agent("openai", { apiKey: "test", baseUrl });
    agent.registerTool({
      name: "double",
      description: "Double a number",
      parameters: {},
      execute: (args: unknown) =>
        String(((args as { x?: number })?.x ?? 0) * 2),
    });
    agent.registerTool({
      name: "square",
      description: "Square a number",
      parameters: {},
      execute: (args: unknown) => {
        const x = (args as { x?: number })?.x ?? 0;
        return String(x * x);
      },
    });

    const msgs = await agent.run({
      role: Role.User,
      content: "Calculate double(2) and square(3)",
    });

    const toolCalls = msgs.filter((m) => m.role === Role.ToolCall);
    const toolResults = msgs.filter((m) => m.role === Role.ToolResult);

    expect(toolCalls).toHaveLength(2);
    expect(toolResults).toHaveLength(2);
    expect(agent.context.some((m) => m.role === Role.Ai)).toBe(true);

    await server.stop();
  });

  it("multi-round tool calls: AI calls tool A -> result -> AI then calls tool B -> result -> AI final reply", async () => {
    let callCount = 0;
    const server = createMockOpenAIServer((body) => {
      callCount++;
      const messages = body.messages ?? [];
      const toolResults = messages.filter((m: { role: string }) => m.role === "tool");
      if (callCount === 1) {
        return {
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: { name: "step1", arguments: "{}" },
            },
          ],
        };
      }
      if (callCount === 2 && toolResults.length === 1) {
        return {
          tool_calls: [
            {
              id: "call_2",
              type: "function",
              function: { name: "step2", arguments: "{}" },
            },
          ],
        };
      }
      return { content: "Final answer" };
    });
    const baseUrl = await server.start();

    const agent = new Agent("openai", { apiKey: "test", baseUrl });
    agent.registerTool({
      name: "step1",
      description: "First step",
      parameters: {},
      execute: () => "ok1",
    });
    agent.registerTool({
      name: "step2",
      description: "Second step",
      parameters: {},
      execute: () => "ok2",
    });

    const msgs = await agent.run({
      role: Role.User,
      content: "Do step1 then step2",
    });

    const toolCalls = msgs.filter((m) => m.role === Role.ToolCall);
    expect(toolCalls).toHaveLength(2);
    expect(toolCalls[0].toolName).toBe("step1");
    expect(toolCalls[1].toolName).toBe("step2");

    const lastAi = [...msgs].reverse().find((m) => m.role === Role.Ai);
    expect(lastAi).toHaveProperty("content", "Final answer");

    await server.stop();
  });

  it("tool execution throws exception: verifies ToolResult with isError: true is generated and passed back correctly", async () => {
    let callCount = 0;
    const server = createMockOpenAIServer((body) => {
      callCount++;
      const messages = body.messages ?? [];
      const hasToolResult = messages.some(
        (m: { role: string }) => m.role === "tool"
      );
      if (callCount === 1) {
        return {
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: { name: "failing", arguments: "{}" },
            },
          ],
        };
      }
      if (hasToolResult) {
        return { content: "I see there was an error" };
      }
      return { content: "..." };
    });
    const baseUrl = await server.start();

    const agent = new Agent("openai", { apiKey: "test", baseUrl });
    agent.registerTool({
      name: "failing",
      description: "Always fails",
      parameters: {},
      execute: () => {
        throw new Error("Tool failed intentionally");
      },
    });

    const msgs = await agent.run({
      role: Role.User,
      content: "Call failing tool",
    });

    const toolResults = msgs.filter((m) => m.role === Role.ToolResult);
    expect(toolResults).toHaveLength(1);
    expect(toolResults[0].isError).toBe(true);
    expect(toolResults[0].content).toBe("Tool failed intentionally");

    await server.stop();
  });

  it("call unregistered tool: verifies error is thrown", async () => {
    const server = createMockOpenAIServer(() => ({
      tool_calls: [
        {
          id: "call_1",
          type: "function",
          function: { name: "unregistered_tool", arguments: "{}" },
        },
      ],
    }));
    const baseUrl = await server.start();

    const agent = new Agent("openai", { apiKey: "test", baseUrl });

    await expect(
      agent.run({ role: Role.User, content: "Use unregistered tool" })
    ).rejects.toThrow('Tool "unregistered_tool" is not registered');

    await server.stop();
  });
});

describe("OpenAI adapter error handling", () => {
  it("missing apiKey: throws error", async () => {
    const server = createMockOpenAIServer(() => ({ content: "hi" }));
    const baseUrl = await server.start();

    const agent = new Agent("openai", { baseUrl });

    await expect(
      agent.step({ role: Role.User, content: "Hi" })
    ).rejects.toThrow("OpenAI adapter requires apiKey in config");

    await server.stop();
  });

  it("HTTP non-200 response: throws error including status code", async () => {
    const http = await import("http");
    const srv = http.createServer((req, res) => {
      if (req.method === "POST" && req.url === "/v1/chat/completions") {
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", () => {
          res.writeHead(500);
          res.end(JSON.stringify({ error: { message: "Server error" } }));
        });
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    const baseUrl = await new Promise<string>((resolve) => {
      srv.listen(0, "127.0.0.1", () => {
        const addr = srv.address();
        const port =
          typeof addr === "object" && addr ? addr.port : 0;
        resolve(`http://127.0.0.1:${port}`);
      });
    });

    const agent = new Agent("openai", { apiKey: "x", baseUrl });

    await expect(
      agent.step({ role: Role.User, content: "Hi" })
    ).rejects.toThrow(/500|Server error/);

    await new Promise<void>((resolve) => srv.close(() => resolve()));
  });

  it("API returns error field: throws API error message", async () => {
    const http = await import("http");
    const srv = http.createServer((req, res) => {
      if (req.method === "POST" && req.url === "/v1/chat/completions") {
        res.writeHead(200);
        res.end(
          JSON.stringify({
            error: { message: "Rate limit exceeded" },
          })
        );
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    const baseUrl = await new Promise<string>((resolve) => {
      srv.listen(0, "127.0.0.1", () => {
        const addr = srv.address();
        const port =
          typeof addr === "object" && addr ? addr.port : 0;
        resolve(`http://127.0.0.1:${port}`);
      });
    });

    const agent = new Agent("openai", { apiKey: "x", baseUrl });

    await expect(
      agent.step({ role: Role.User, content: "Hi" })
    ).rejects.toThrow(/Rate limit exceeded/);

    await new Promise<void>((resolve) => srv.close(() => resolve()));
  });

  it("API returns invalid JSON: throws parse error", async () => {
    const http = await import("http");
    const srv = http.createServer((req, res) => {
      if (req.method === "POST" && req.url === "/v1/chat/completions") {
        res.writeHead(200);
        res.end("not json");
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    const baseUrl = await new Promise<string>((resolve) => {
      srv.listen(0, "127.0.0.1", () => {
        const addr = srv.address();
        const port =
          typeof addr === "object" && addr ? addr.port : 0;
        resolve(`http://127.0.0.1:${port}`);
      });
    });

    const agent = new Agent("openai", { apiKey: "x", baseUrl });

    await expect(
      agent.step({ role: Role.User, content: "Hi" })
    ).rejects.toThrow(/invalid JSON/);

    await new Promise<void>((resolve) => srv.close(() => resolve()));
  });
});

describe("Context management", () => {
  it("after multiple calls, verifies agent.context contains complete conversation history", async () => {
    const server = createMockOpenAIServer((body) => {
      const messages = body.messages ?? [];
      const lastUser = [...messages].reverse().find((m: { role: string }) => m.role === "user");
      const content = (lastUser as { content?: string })?.content ?? "";
      return { content: `Echo: ${content}` };
    });
    const baseUrl = await server.start();

    const agent = new Agent("openai", { apiKey: "test", baseUrl });
    await agent.step({ role: Role.User, content: "First" });
    await agent.step({ role: Role.User, content: "Second" });

    expect(agent.context).toHaveLength(4);
    expect(agent.context[0]).toEqual({ role: Role.User, content: "First" });
    expect(agent.context[1]).toHaveProperty("role", Role.Ai);
    expect(agent.context[2]).toEqual({ role: Role.User, content: "Second" });
    expect(agent.context[3]).toHaveProperty("role", Role.Ai);

    await server.stop();
  });

  it("verifies ToolCall and ToolResult messages are correctly preserved in context", async () => {
    let callCount = 0;
    const server = createMockOpenAIServer((body) => {
      callCount++;
      const messages = body.messages ?? [];
      const hasToolResult = messages.some(
        (m: { role: string }) => m.role === "tool"
      );
      if (callCount === 1) {
        return {
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: { name: "echo", arguments: '{"x":"hello"}' },
            },
          ],
        };
      }
      if (hasToolResult) {
        return { content: "Done" };
      }
      return { content: "..." };
    });
    const baseUrl = await server.start();

    const agent = new Agent("openai", { apiKey: "test", baseUrl });
    agent.registerTool({
      name: "echo",
      description: "Echo",
      parameters: {},
      execute: (args: unknown) =>
        (args as { x?: string })?.x ?? "",
    });

    await agent.run({ role: Role.User, content: "Echo hello" });

    const toolCalls = agent.context.filter((m) => m.role === Role.ToolCall);
    const toolResults = agent.context.filter((m) => m.role === Role.ToolResult);

    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].toolName).toBe("echo");
    expect(toolCalls[0].argsText).toContain("hello");

    expect(toolResults).toHaveLength(1);
    expect(toolResults[0].content).toBe("hello");
    expect(toolResults[0].callId).toBe(toolCalls[0].callId);

    await server.stop();
  });
});
