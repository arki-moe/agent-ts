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

export interface AgentLike {
  context: Context;
  registerTool: (tool: Tool) => void;
  run: (message: string, options?: RunOptions) => Promise<Message[]>;
}

export type Tool = {
  name: string;
  description: string;
  parameters: unknown;
  execute: (args: unknown, agent: AgentLike) => Promise<unknown> | unknown;
};

export type AgentConfig = {
  endCondition?: (context: Message[], last: Message) => boolean;
  onStream?: (textDelta: string) => void | Promise<void>;
  onToolCall?: (
    message: Extract<Message, { role: Role.ToolCall }>,
    args: unknown,
    agent: AgentLike,
  ) => boolean | void | Promise<boolean | void>;
  onToolResult?: (
    message: Extract<Message, { role: Role.ToolResult }>,
    agent: AgentLike,
  ) => void | Promise<void>;
  [key: string]: unknown;
};

export type RunOptions = {
  once?: boolean;
};

export type Adapter = (
  config: Record<string, unknown>,
  context: Message[],
  tools: Tool[],
) => Promise<Message[]>;
