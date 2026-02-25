import { openaiAdapter } from "./adapter/openai";
import { openrouterAdapter } from "./adapter/openrouter";
import type { Adapter, Context, Message, Tool } from "./types";
import { Role } from "./types";

export { openaiAdapter } from "./adapter/openai";
export { openrouterAdapter } from "./adapter/openrouter";
export type { Adapter, Context, Message, Tool } from "./types";
export { Role } from "./types";

const adapters: Record<string, Adapter> = {
  openai: openaiAdapter,
  openrouter: openrouterAdapter,
};

export class Agent {
  context: Context = [];
  private adapter: Adapter;
  private config: Record<string, unknown>;
  private tools: Tool[] = [];

  constructor(adapterName: string, config: Record<string, unknown>) {
    this.adapter = adapters[adapterName] ?? (() => { throw new Error(`Adapter "${adapterName}" not found`); })();
    this.config = config;
  }

  registerTool(tool: Tool): void {
    this.tools.push(tool);
  }

  async step(message?: Message, autoAppend = true): Promise<Message[]> {
    const context = autoAppend ? this.context : [...this.context];

    if (message) {
      context.push(message);
    }

    const msgs = await this.adapter(this.config, context, this.tools);
    context.push(...msgs);
    return msgs;
  }

  async run(message: Message, autoAppend = true): Promise<Message[]> {
    const all: Message[] = [];
    const originalContext = this.context;
    if (!autoAppend) {
      this.context = [...this.context];
    }

    try {
      let msgs = await this.step(message, true);
      all.push(...msgs);

      for (;;) {
        const last = msgs[msgs.length - 1];
        if (last.role === Role.Ai) return all;

        for (const m of msgs) {
          if (m.role !== Role.ToolCall) continue;
          const tool = this.tools.find((t) => t.name === m.toolName);
          if (!tool) throw new Error(`Tool "${m.toolName}" is not registered`);

          let content: string;
          let isError = false;
          try {
            const args = JSON.parse(m.argsText || "{}") as unknown;
            const out = await Promise.resolve(tool.execute(args));
            content = typeof out === "string" ? out : JSON.stringify(out);
          } catch (err) {
            isError = true;
            content = err instanceof Error ? err.message : String(err);
          }

          const result: Message = { role: Role.ToolResult, callId: m.callId, content, isError };
          this.context.push(result);
          all.push(result);
        }

        msgs = await this.step(undefined, true);
        all.push(...msgs);
      }
    } finally {
      if (!autoAppend) {
        this.context = originalContext;
      }
    }
  }
}
