import { Role, type Message, type Tool } from "../types";
import { readSse } from "./sse";

const ROLE_TO_OPENAI: Record<string, string> = {
  [Role.System]: "system",
  [Role.User]: "user",
  [Role.Ai]: "assistant",
};

function toOpenAIMessages(context: Message[]): any[] {
  return context.reduce<any[]>((out, m) => {
    if (m.role === Role.System || m.role === Role.User || m.role === Role.Ai)
      return [...out, { role: ROLE_TO_OPENAI[m.role], content: m.content }];
    if (m.role === Role.ToolResult)
      return [...out, { role: "tool", content: m.content, tool_call_id: m.callId }];
    if (m.role === Role.ToolCall) {
      const tc = { id: m.callId, type: "function", function: { name: m.toolName, arguments: m.argsText ?? "{}" } };
      const last = out[out.length - 1];
      if (last?.tool_calls) {
        last.tool_calls.push(tc);
        return out;
      }
      return [...out, { role: "assistant", tool_calls: [tc] }];
    }
    return out;
  }, []);
}

export async function openaiAdapter(
  config: Record<string, unknown>,
  context: Message[],
  tools: Tool[]
): Promise<Message[]> {
  const baseUrl = (config.baseUrl as string) ?? "https://api.openai.com";
  const apiKey = (config.apiKey as string) || process.env.OPENAI_API_KEY || "";
  const model = (config.model as string) ?? "gpt-5-nano";
  const onStream = config.onStream as ((textDelta: string) => void | Promise<void>) | undefined;

  if (!apiKey) throw new Error("OpenAI adapter requires apiKey in config or OPENAI_API_KEY env");

  const contextMessages = toOpenAIMessages(context);
  const systemContent = config.system as string | undefined;
  const messages =
    systemContent
      ? [{ role: "system" as const, content: systemContent }, ...contextMessages]
      : contextMessages;

  const body = {
    model,
    messages,
    tools: tools.length ? tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters ?? {} } })) : undefined,
    tool_choice: tools.length ? "auto" : undefined,
    stream: onStream ? true : undefined,
  };

  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    let errMsg = `OpenAI API HTTP ${res.status}`;
    try {
      const parsed = JSON.parse(text);
      if (parsed?.error?.message) errMsg = parsed.error.message;
    } catch {
      if (text) errMsg += `: ${text.slice(0, 200)}`;
    }
    throw new Error(errMsg);
  }

  if (onStream) {
    let content = "";

    await readSse(res, async (dataLine) => {
      if (dataLine === "[DONE]") return;

      let parsed: any;
      try {
        parsed = JSON.parse(dataLine);
      } catch {
        throw new Error(`OpenAI API returned invalid JSON: ${dataLine.slice(0, 200)}`);
      }

      const delta = parsed?.choices?.[0]?.delta;
      if (!delta) return;

      if (typeof delta.content === "string") {
        content += delta.content;
        await Promise.resolve(onStream(delta.content));
      }
    });

    return [{ role: Role.Ai, content }];
  }

  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`OpenAI API returned invalid JSON: ${text.slice(0, 200)}`);
  }

  if (data.error) throw new Error(`OpenAI API error: ${data.error.message}`);

  const msg = data.choices?.[0]?.message;
  if (!msg) throw new Error("OpenAI API returned empty response");

  if (msg.tool_calls?.length) {
    return msg.tool_calls.map((tc: any) => ({
      role: Role.ToolCall,
      toolName: tc.function.name,
      callId: tc.id,
      argsText: tc.function.arguments ?? "{}",
    }));
  }

  return [{ role: Role.Ai, content: msg.content ?? "" }];
}
