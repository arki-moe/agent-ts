import { openaiAdapter } from "./adapter/openai";
import { openrouterAdapter } from "./adapter/openrouter";
import type { Adapter, AgentConfig, Context, Message, RunOptions, Tool } from "./types";
import { Role } from "./types";

export { openaiAdapter } from "./adapter/openai";
export { openrouterAdapter } from "./adapter/openrouter";
export type { Adapter, AgentConfig, Context, Message, RunOptions, Tool } from "./types";
export { Role } from "./types";

const adapters: Record<string, Adapter> = {
  openai: openaiAdapter,
  openrouter: openrouterAdapter,
};

export class Agent {
  context: Context = [];
  private adapter: Adapter;
  private adapterName: string;
  private config: AgentConfig;
  private tools: Tool[] = [];
  private endCondition: (context: Message[], last: Message) => boolean;
  private onToolCall?: AgentConfig["onToolCall"];
  private onToolResult?: AgentConfig["onToolResult"];

  constructor(adapterName: string, config: AgentConfig) {
    this.adapterName = adapterName;
    this.adapter = adapters[adapterName] ?? (() => { throw new Error(`Adapter "${adapterName}" not found`); })();
    this.config = config;
    this.endCondition = config.endCondition ?? ((_ctx, last) => last.role === Role.Ai);
    this.onToolCall = config.onToolCall;
    this.onToolResult = config.onToolResult;
  }

  registerTool(tool: Tool): void {
    this.tools.push(tool);
  }

  async run(message: string, options: RunOptions = {}): Promise<Message[]> {
    const once = options.once ?? false;
    const all: Message[] = [];
    const sessionContext = [...this.context];
    const persistToContext = (msgs: Message[]): void => {
      this.context.push(...msgs);
    };
    const pushToSession = (msgs: Message[]): void => {
      sessionContext.push(...msgs);
    };

    const userMessage: Message = { role: Role.User, content: message };
    pushToSession([userMessage]);
    if (!once) persistToContext([userMessage]);

    const runAdapter = async (): Promise<Message[]> => {
      const msgs = await this.adapter(this.config, sessionContext, this.tools);
      pushToSession(msgs);
      persistToContext(msgs);
      all.push(...msgs);
      return msgs;
    };

    let msgs = await runAdapter();

    for (;;) {
      const last = msgs[msgs.length - 1];
      if (this.endCondition(sessionContext, last)) return all;

      const toolCalls = msgs.filter(
        (m): m is Extract<Message, { role: Role.ToolCall }> => m.role === Role.ToolCall,
      );
      if (toolCalls.length === 0) return all;

      type ToolResultMessage = Extract<Message, { role: Role.ToolResult }>;
      const results = await Promise.all(
        toolCalls.map(async (m) => {
          const tool = this.tools.find((t) => t.name === m.toolName);
          if (!tool) throw new Error(`Tool "${m.toolName}" is not registered`);

          let args: unknown;
          try {
            args = JSON.parse(m.argsText || "{}") as unknown;
          } catch (err) {
            const result: ToolResultMessage = {
              role: Role.ToolResult,
              callId: m.callId,
              content: err instanceof Error ? err.message : String(err),
              isError: true,
            };
            if (this.onToolResult) await Promise.resolve(this.onToolResult(result));
            return result;
          }

          if (this.onToolCall) {
            const shouldRun = await Promise.resolve(this.onToolCall(m, args));
            if (shouldRun === false) return null;
          }

          let content: string;
          let isError = false;
          try {
            const out = await Promise.resolve(tool.execute(args));
            content = typeof out === "string" ? out : JSON.stringify(out);
          } catch (err) {
            isError = true;
            content = err instanceof Error ? err.message : String(err);
          }

          const result: ToolResultMessage = { role: Role.ToolResult, callId: m.callId, content, isError };
          if (this.onToolResult) await Promise.resolve(this.onToolResult(result));
          return result;
        }),
      );

      const filteredResults = results.filter(
        (result): result is ToolResultMessage => result !== null,
      );
      pushToSession(filteredResults);
      persistToContext(filteredResults);
      all.push(...filteredResults);

      msgs = await runAdapter();
    }
  }

}
