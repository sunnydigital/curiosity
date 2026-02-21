/**
 * Client-side Ollama streaming for browser-to-localhost communication.
 * This bypasses the server entirely, streaming directly from the user's local Ollama.
 */

export async function* streamOllamaChat(params: {
  baseUrl: string;
  model: string;
  messages: { role: string; content: string }[];
  temperature?: number;
}): AsyncGenerator<string> {
  const { baseUrl, model, messages, temperature = 0.7 } = params;

  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      options: { temperature },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`Ollama error: ${errorText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body from Ollama");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const data = JSON.parse(line);
        if (data.message?.content) {
          yield data.message.content;
        }
      } catch {
        // ignore parse errors
      }
    }
  }
}

export async function generateOllamaEmbedding(params: {
  baseUrl: string;
  model: string;
  text: string;
}): Promise<number[]> {
  const response = await fetch(`${params.baseUrl}/api/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: params.model, prompt: params.text }),
  });
  if (!response.ok) throw new Error(`Ollama embedding error: ${response.statusText}`);
  const data = await response.json();
  return data.embedding;
}

export async function completeOllama(params: {
  baseUrl: string;
  model: string;
  messages: { role: string; content: string }[];
  temperature?: number;
}): Promise<string> {
  const response = await fetch(`${params.baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: params.model,
      messages: params.messages,
      stream: false,
      options: { temperature: params.temperature ?? 0.3 },
    }),
  });
  if (!response.ok) throw new Error(`Ollama completion error: ${response.statusText}`);
  const data = await response.json();
  return data.message?.content || "";
}
