import OpenAI from "openai";
import { BaseLLMProvider } from "./types";
import { getModelMetadata } from "./pi-models";
import type {
  LLMCompletionRequest,
  LLMCompletionResponse,
  LLMStreamChunk,
  EmbeddingRequest,
  EmbeddingResponse,
} from "@/types";

/** Extract the chatgpt_account_id from an OpenAI OAuth JWT access token. */
function extractAccountId(token: string): string | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    return payload?.["https://api.openai.com/auth"]?.chatgpt_account_id ?? null;
  } catch {
    return null;
  }
}

export class OpenAIProvider extends BaseLLMProvider {
  name = "openai" as const;
  private client: OpenAI;

  constructor(credential: string, isOAuthToken = false) {
    super();
    if (isOAuthToken) {
      const accountId = extractAccountId(credential);
      this.client = new OpenAI({
        apiKey: credential,
        defaultHeaders: {
          ...(accountId ? { "chatgpt-account-id": accountId } : {}),
        },
      });
    } else {
      this.client = new OpenAI({ apiKey: credential });
    }
  }

  /** Reasoning models don't support temperature and use max_completion_tokens. */
  private isReasoningModel(model: string): boolean {
    const meta = getModelMetadata("openai", model);
    if (meta) return meta.reasoning;
    // Fallback for models not in pi-ai registry
    return /^o\d/.test(model);
  }

  private buildParams(req: LLMCompletionRequest, extra?: Record<string, any>) {
    const reasoning = this.isReasoningModel(req.model);
    return {
      model: req.model,
      messages: this.formatMessages(req.messages) as any,
      // Reasoning models reject the temperature parameter
      ...(reasoning ? {} : { temperature: req.temperature ?? 0.7 }),
      // Reasoning models use max_completion_tokens; others use max_tokens
      ...(req.maxTokens
        ? reasoning
          ? { max_completion_tokens: req.maxTokens }
          : { max_tokens: req.maxTokens }
        : {}),
      ...extra,
    };
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
    const response = await this.client.chat.completions.create(
      this.buildParams(req)
    );

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
      ...this.buildParams(req),
      stream: true as const,
    });

    for await (const chunk of response) {
      const content = chunk.choices[0]?.delta?.content || "";
      const finishReason = chunk.choices[0]?.finish_reason;
      if (content) {
        yield { content, done: false };
      }
      if (finishReason !== null && finishReason !== undefined) {
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

}
