import Anthropic from "@anthropic-ai/sdk";
import { BaseLLMProvider } from "./types";
import type {
  LLMCompletionRequest,
  LLMCompletionResponse,
  LLMStreamChunk,
  EmbeddingRequest,
  EmbeddingResponse,
} from "@/types";

export class AnthropicProvider extends BaseLLMProvider {
  name = "anthropic" as const;
  private client: Anthropic;

  constructor(credential: string, useBearer = false) {
    super();
    this.client = useBearer
      ? new Anthropic({
          authToken: credential,
          apiKey: null,
          defaultHeaders: {
            "anthropic-beta": "claude-code-20250219,oauth-2025-04-20",
            "anthropic-dangerous-direct-browser-access": "true",
            "user-agent": "claude-cli/2.1.2 (external, cli)",
            "x-app": "cli",
          },
        })
      : new Anthropic({ apiKey: credential });
  }

  private formatMessage(m: { role: string; content: string; image?: { base64: string; mimeType: string } }) {
    if (m.image) {
      return {
        role: m.role as "user" | "assistant",
        content: [
          {
            type: "image" as const,
            source: {
              type: "base64" as const,
              media_type: m.image.mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
              data: m.image.base64,
            },
          },
          { type: "text" as const, text: m.content },
        ],
      };
    }
    return {
      role: m.role as "user" | "assistant",
      content: m.content,
    };
  }

  private buildSystemPrompt(messages: LLMCompletionRequest["messages"]): string | undefined {
    const systemMessages = messages.filter((m) => m.role === "system");
    if (systemMessages.length === 0) return undefined;
    return systemMessages.map((m) => m.content).join("\n\n");
  }

  async complete(req: LLMCompletionRequest): Promise<LLMCompletionResponse> {
    const systemPrompt = this.buildSystemPrompt(req.messages);
    const nonSystemMessages = req.messages.filter((m) => m.role !== "system");

    const response = await this.client.messages.create({
      model: req.model,
      max_tokens: req.maxTokens || 4096,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      messages: nonSystemMessages.map((m) => this.formatMessage(m)) as any,
      temperature: req.temperature ?? 0.7,
    });

    const content =
      response.content[0]?.type === "text" ? response.content[0].text : "";

    return {
      content,
      model: response.model,
      provider: "anthropic",
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens:
          response.usage.input_tokens + response.usage.output_tokens,
      },
    };
  }

  async *stream(
    req: LLMCompletionRequest
  ): AsyncGenerator<LLMStreamChunk, void, unknown> {
    const systemPrompt = this.buildSystemPrompt(req.messages);
    const nonSystemMessages = req.messages.filter((m) => m.role !== "system");

    const stream = this.client.messages.stream({
      model: req.model,
      max_tokens: req.maxTokens || 4096,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      messages: nonSystemMessages.map((m) => this.formatMessage(m)) as any,
      temperature: req.temperature ?? 0.7,
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        yield { content: event.delta.text, done: false };
      }
      if (event.type === "message_stop") {
        yield { content: "", done: true };
      }
    }
  }

  async embed(req: EmbeddingRequest): Promise<EmbeddingResponse> {
    const model = req.model || "voyage-3-lite";
    const response = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.client.apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: [req.text],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Voyage AI embeddings error (${response.status}): ${err}`);
    }

    const data = await response.json();
    const embedding = data.data[0].embedding;

    return {
      embedding,
      dimensions: embedding.length,
    };
  }

}
