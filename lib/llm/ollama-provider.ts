import { BaseLLMProvider } from "./types";
import type {
  LLMCompletionRequest,
  LLMCompletionResponse,
  LLMStreamChunk,
  EmbeddingRequest,
  EmbeddingResponse,
} from "@/types";

export class OllamaProvider extends BaseLLMProvider {
  name = "ollama" as const;
  private baseUrl: string;

  constructor(baseUrl: string = "http://localhost:11434") {
    super();
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  private formatMessages(messages: LLMCompletionRequest["messages"]) {
    return messages.map((m) => {
      const msg: any = { role: m.role, content: m.content };
      if (m.image) {
        msg.images = [m.image.base64];
      }
      return msg;
    });
  }

  async complete(req: LLMCompletionRequest): Promise<LLMCompletionResponse> {
    console.log(`[OllamaProvider] complete() called with model: ${req.model}, baseUrl: ${this.baseUrl}`);
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: req.model,
        messages: this.formatMessages(req.messages),
        stream: false,
        options: {
          temperature: req.temperature ?? 0.7,
          num_predict: req.maxTokens,
        },
      }),
    });

    console.log(`[OllamaProvider] Response status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[OllamaProvider] Error response:`, errorText);
      throw new Error(`Ollama error: ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`[OllamaProvider] Success, model used: ${data.model}`);
    return {
      content: data.message?.content || "",
      model: data.model,
      provider: "ollama",
      usage: data.eval_count
        ? {
          promptTokens: data.prompt_eval_count || 0,
          completionTokens: data.eval_count || 0,
          totalTokens:
            (data.prompt_eval_count || 0) + (data.eval_count || 0),
        }
        : undefined,
    };
  }

  async *stream(
    req: LLMCompletionRequest
  ): AsyncGenerator<LLMStreamChunk, void, unknown> {
    console.log(`[OllamaProvider] stream() called with model: ${req.model}, baseUrl: ${this.baseUrl}`);
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: req.model,
        messages: this.formatMessages(req.messages),
        stream: true,
        options: {
          temperature: req.temperature ?? 0.7,
          num_predict: req.maxTokens,
        },
      }),
    });

    console.log(`[OllamaProvider] Response status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[OllamaProvider] Error response:`, errorText);
      throw new Error(`Ollama error: ${response.statusText}`);
    }

    console.log(`[OllamaProvider] Starting stream parsing`);
    if (!response.ok) {
      throw new Error(`Ollama error: ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

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
        const data = JSON.parse(line);
        if (data.message?.content) {
          yield { content: data.message.content, done: false };
        }
        if (data.done) {
          yield { content: "", done: true };
        }
      }
    }
  }

  async embed(req: EmbeddingRequest): Promise<EmbeddingResponse> {
    const response = await fetch(`${this.baseUrl}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: req.model || "nomic-embed-text",
        input: req.text,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama embedding error: ${response.statusText}`);
    }

    const data = await response.json();
    const embedding = data.embeddings?.[0] || [];
    return {
      embedding,
      dimensions: embedding.length,
    };
  }

  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) return [];
      const data = await response.json();
      return (data.models || []).map((m: any) => m.name);
    } catch {
      return [];
    }
  }
}
