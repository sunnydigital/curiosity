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

  constructor(apiKey: string) {
    super();
    this.client = new Anthropic({ apiKey });
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

  async complete(req: LLMCompletionRequest): Promise<LLMCompletionResponse> {
    const systemMessage = req.messages.find((m) => m.role === "system");
    const nonSystemMessages = req.messages.filter((m) => m.role !== "system");

    const response = await this.client.messages.create({
      model: req.model,
      max_tokens: req.maxTokens || 4096,
      system: systemMessage?.content,
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
    const systemMessage = req.messages.find((m) => m.role === "system");
    const nonSystemMessages = req.messages.filter((m) => m.role !== "system");

    const stream = this.client.messages.stream({
      model: req.model,
      max_tokens: req.maxTokens || 4096,
      system: systemMessage?.content,
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

  async embed(_req: EmbeddingRequest): Promise<EmbeddingResponse> {
    throw new Error(
      "Anthropic does not provide an embeddings API. Configure a different embedding provider in settings."
    );
  }

  async listModels(): Promise<string[]> {
    return [
      "claude-opus-4-5-20251101",
      "claude-sonnet-4-20250514",
      "claude-haiku-3-5-20241022",
      "claude-3-5-sonnet-20241022",
    ];
  }
}
