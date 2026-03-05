export async function readSse(
  res: Response,
  onData: (data: string) => void | Promise<void>
): Promise<void> {
  const body = res.body;
  if (!body) throw new Error("Response body is empty");

  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let dataLines: string[] = [];

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      let line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);

      if (line === "") {
        if (dataLines.length > 0) {
          const data = dataLines.join("\n");
          dataLines = [];
          await onData(data);
        }
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trimStart());
      }

      newlineIndex = buffer.indexOf("\n");
    }
  }

  if (buffer) {
    let line = buffer;
    if (line.endsWith("\r")) line = line.slice(0, -1);
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }

  if (dataLines.length > 0) {
    const data = dataLines.join("\n");
    await onData(data);
  }
}
