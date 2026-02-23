import * as http from "http";

export type MockHandler = (body: {
  model?: string;
  messages?: Array<{ role: string; content?: string; tool_calls?: unknown[] }>;
  tools?: unknown[];
}) => {
  content?: string;
  tool_calls?: Array<{
    id: string;
    type: string;
    function: { name: string; arguments: string };
  }>;
};

export function createMockOpenAIServer(handler: MockHandler) {
  const server = http.createServer((req, res) => {
    if (req.method !== "POST" || req.url !== "/v1/chat/completions") {
      res.writeHead(404);
      res.end();
      return;
    }

    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const parsed = JSON.parse(body);
        const result = handler(parsed);
        const response = {
          id: "mock-id",
          choices: [
            {
              message: {
                role: "assistant",
                content: result.content ?? null,
                tool_calls: result.tool_calls,
              },
              finish_reason: result.tool_calls?.length ? "tool_calls" : "stop",
            },
          ],
        };
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(response));
      } catch (err) {
        res.writeHead(500);
        res.end(
          JSON.stringify({
            error: { message: err instanceof Error ? err.message : String(err) },
          })
        );
      }
    });
  });

  return {
    start(): Promise<string> {
      return new Promise((resolve) => {
        server.listen(0, "127.0.0.1", () => {
          const addr = server.address();
          const port =
            typeof addr === "object" && addr ? addr.port : 0;
          resolve(`http://127.0.0.1:${port}`);
        });
      });
    },
    stop(): Promise<void> {
      return new Promise((resolve) => {
        server.close(() => resolve());
      });
    },
  };
}
