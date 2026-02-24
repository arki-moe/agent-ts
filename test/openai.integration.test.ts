import { describe, it, expect } from "vitest";
import { Agent, Role } from "../src/index";

const openaiApiKey = process.env.OPENAI_API_KEY;
const itIfOpenAI = openaiApiKey ? it : it.skip;

if (!openaiApiKey) {
  console.warn("OPENAI_API_KEY not set, skipping openai adapter tests");
}

describe("Agent construction and configuration", () => {
  it("throws error when constructing Agent with non-existent adapter name", () => {
    expect(() => new Agent("nonexistent", { apiKey: "x" })).toThrow(
      'Adapter "nonexistent" not found'
    );
  });

  it("constructs openai adapter normally", () => {
    const agent = new Agent("openai", {
      apiKey: "x",
    });
    expect(agent.context).toEqual([]);
  });
});

describe("OpenAI adapter integration", () => {
  itIfOpenAI("sends user message and receives reply", async () => {
    const agent = new Agent("openai", {
      apiKey: openaiApiKey as string,
      model: "gpt-5-nano",
    });
    const msgs = await agent.step({ role: Role.User, content: "Reply with one short sentence." });

    expect(msgs).toHaveLength(1);
    expect(msgs[0].role).toBe(Role.Ai);
    const aiMsg = msgs[0];
    if (aiMsg.role !== Role.Ai) throw new Error("Expected AI message");
    expect(typeof aiMsg.content).toBe("string");
    expect(aiMsg.content.length).toBeGreaterThan(0);
  }, 20000);

  itIfOpenAI("handles tool calls via Agent.run", async () => {
    const agent = new Agent("openai", {
      apiKey: openaiApiKey as string,
      model: "gpt-5-nano",
    });

    agent.registerTool({
      name: "add",
      description: "Add two numbers",
      parameters: {
        type: "object",
        properties: {
          a: { type: "number" },
          b: { type: "number" },
        },
        required: ["a", "b"],
      },
      execute: async (args) => {
        const { a, b } = args as { a: number; b: number };
        return String(a + b);
      },
    });

    const all = await agent.run({
      role: Role.User,
      content:
        "Call the add tool with a=2 and b=3, then respond with only the result.",
    });

    const toolCall = all.find((m) => m.role === Role.ToolCall);
    const toolResult = all.find((m) => m.role === Role.ToolResult);
    const aiMsg = all.find((m) => m.role === Role.Ai);

    expect(toolCall).toBeTruthy();
    expect(toolResult).toBeTruthy();
    if (toolResult?.role === Role.ToolResult) {
      expect(toolResult.content).toContain("5");
      expect(toolResult.isError).not.toBe(true);
    }
    expect(aiMsg).toBeTruthy();
  }, 20000);
});
