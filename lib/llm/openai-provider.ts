import OpenAI from "openai";
import { BaseLLMProvider } from "./types";
import type {
  LLMCompletionRequest,
  LLMCompletionResponse,
  LLMStreamChunk,
  EmbeddingRequest,
  EmbeddingResponse,
} from "@/types";

export class OpenAIProvider extends BaseLLMProvider {
  name = "openai" as const;
  private client: OpenAI;

  constructor(apiKey: string) {
    super();
    this.client = new OpenAI({ apiKey });
  }

  private formatMessages(messages: LLMCompletionRequest["messages"]) {
    return messages.map((m) => {
      if (m.image) {
        return {
          role: m.role,
          content: [
            { type: "text" as const, text: m.content },
            {
              type: "image_url" as const,
              image_url: { url: `data:${m.image.mimeType};base64,${m.image.base64}` },
            },
          ],
        };
      }
      return { role: m.role, content: m.content };
    });
  }

  async complete(req: LLMCompletionRequest): Promise<LLMCompletionResponse> {
    const response = await this.client.chat.completions.create({
      model: req.model,
      messages: this.formatMessages(req.messages) as any,
      temperature: req.temperature ?? 0.7,
      max_tokens: req.maxTokens,
    });

    return {
      content: response.choices[0]?.message?.content || "",
      model: response.model,
      provider: "openai",
      usage: response.usage
        ? {
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
            totalTokens: response.usage.total_tokens,
          }
        : undefined,
    };
  }

  async *stream(
    req: LLMCompletionRequest
  ): AsyncGenerator<LLMStreamChunk, void, unknown> {
    const response = await this.client.chat.completions.create({
      model: req.model,
      messages: this.formatMessages(req.messages) as any,
      temperature: req.temperature ?? 0.7,
      max_tokens: req.maxTokens,
      stream: true,
    });

    for await (const chunk of response) {
      const content = chunk.choices[0]?.delta?.content || "";
      const done = chunk.choices[0]?.finish_reason !== null;
      if (content) {
        yield { content, done: false };
      }
      if (done) {
        yield { content: "", done: true };
      }
    }
  }

  async embed(req: EmbeddingRequest): Promise<EmbeddingResponse> {
    const response = await this.client.embeddings.create({
      model: req.model || "text-embedding-3-small",
      input: req.text,
    });

    return {
      embedding: response.data[0].embedding,
      dimensions: response.data[0].embedding.length,
    };
  }

  async listModels(): Promise<string[]> {
    const response = await this.client.models.list();
    return response.data
      .filter((m) => m.id.includes("gpt") || m.id.includes("o1") || m.id.includes("o3"))
      .map((m) => m.id)
      .sort();
  }
}
