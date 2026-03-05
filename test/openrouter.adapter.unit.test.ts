import { afterEach, describe, expect, it, vi } from "vitest";
import { openrouterAdapter } from "../src/adapter/openrouter";
import { Role } from "../src/types";

const encoder = new TextEncoder();

function makeSseResponse(dataLines: string[]): Response {
  const stream = new ReadableStream({
    start(controller) {
      for (const line of dataLines) {
        controller.enqueue(encoder.encode(`data: ${line}\n\n`));
      }
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

describe("openrouterAdapter streaming", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns tool calls when streaming includes tool_calls", async () => {
    const response = makeSseResponse([
      '{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"exec","arguments":"{\\"cmd\\":\\"da"}}]}}]}',
      '{"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"te\\"}"}}]}}]}',
      '{"choices":[{"delta":{"content":"hi"}}]}',
      "[DONE]",
    ]);

    const fetchMock = vi.fn(async () => response);
    vi.stubGlobal("fetch", fetchMock);

    const onStream = vi.fn();
    const msgs = await openrouterAdapter(
      { apiKey: "x", model: "gpt-5-nano", onStream },
      [],
      [],
    );

    expect(onStream).toHaveBeenCalledWith("hi");
    expect(msgs).toHaveLength(1);
    expect(msgs[0].role).toBe(Role.ToolCall);
    if (msgs[0].role === Role.ToolCall) {
      expect(msgs[0].toolName).toBe("exec");
      expect(msgs[0].callId).toBe("call_1");
      expect(msgs[0].argsText).toBe('{"cmd":"date"}');
    }
  });
});
