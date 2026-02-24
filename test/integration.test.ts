import { describe, it, expect } from "vitest";
import { Agent, Role } from "../src/index";

const openaiApiKey = process.env.OPENAI_API_KEY;
const openrouterApiKey = process.env.OPENROUTER_API_KEY;
const itIfOpenAI = openaiApiKey ? it : it.skip;
const itIfOpenRouter = openrouterApiKey ? it : it.skip;

if (!openaiApiKey) {
  console.warn("OPENAI_API_KEY not set, skipping openai adapter tests");
}
if (!openrouterApiKey) {
  console.warn("OPENROUTER_API_KEY not set, skipping openrouter adapter tests");
}

describe("Agent construction and configuration", () => {
  it("throws error when constructing Agent with non-existent adapter name", () => {
    expect(() => new Agent("nonexistent", { apiKey: "x" })).toThrow(
      'Adapter "nonexistent" not found'
    );
  });

  it("constructs normally and verifies initial context is empty", () => {
    const agent = new Agent("openai", {
      apiKey: "x",
    });
    expect(agent.context).toEqual([]);
  });

  it("constructs openrouter adapter normally", () => {
    const agent = new Agent("openrouter", {
      apiKey: "x",
    });
    expect(agent.context).toEqual([]);
  });
});

describe("Agent.step() single-step call", () => {
  itIfOpenAI("openai adapter sends user message and receives reply", async () => {
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
  });

  itIfOpenRouter("openrouter adapter sends user message and receives reply", async () => {
    const agent = new Agent("openrouter", {
      apiKey: openrouterApiKey as string,
      model: "gpt-5-nano",
      httpReferer: "https://example.com",
      title: "Example App",
    });
    const msgs = await agent.step({ role: Role.User, content: "Reply with one short sentence." });

    expect(msgs).toHaveLength(1);
    expect(msgs[0].role).toBe(Role.Ai);
    const aiMsg = msgs[0];
    if (aiMsg.role !== Role.Ai) throw new Error("Expected AI message");
    expect(typeof aiMsg.content).toBe("string");
    expect(aiMsg.content.length).toBeGreaterThan(0);
  });
});
