export enum Role {
  System = "system",
  User = "user",
  Ai = "ai",
  ToolCall = "tool_call",
  ToolResult = "tool_result",
}

export type Message =
  | { role: Role.System; content: string }
  | { role: Role.User; content: string }
  | { role: Role.Ai; content: string }
  | { role: Role.ToolCall; toolName: string; callId: string; argsText: string }
  | { role: Role.ToolResult; callId: string; content: string; isError?: boolean };

export type Context = Message[];

export type Tool = {
  name: string;
  description: string;
  parameters: unknown;
  execute: (args: unknown) => Promise<unknown> | unknown;
};

export type Adapter = (
  config: Record<string, unknown>,
  context: Message[],
  tools: Tool[],
) => Promise<Message[]>;
