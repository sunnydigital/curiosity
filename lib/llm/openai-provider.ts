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

/** Extract the org_id from an OpenAI OAuth JWT access token (for org-scoped tokens). */
function extractOrgId(token: string): string | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    // Check for org ID in standard JWT claims or OpenAI-specific namespace
    return payload?.org_id ?? payload?.["https://api.openai.com/auth"]?.org_id ?? null;
  } catch {
    return null;
  }
}

export class OpenAIProvider extends BaseLLMProvider {
  name = "openai" as const;
  private client: OpenAI;

  constructor(credential: string, isOAuthToken = false) {
    super();
    console.log(`[OpenAIProvider] Constructor called with isOAuthToken: ${isOAuthToken}`);
    if (isOAuthToken) {
      const accountId = extractAccountId(credential);
      console.log(`[OpenAIProvider] OAuth mode - accountId extracted: ${accountId ? 'yes' : 'no'}`);
      // For OAuth, we need to use the Bearer token in Authorization header
      // The OpenAI SDK expects apiKey for Bearer auth (it adds "Bearer " prefix automatically)
      // Based on openclaw implementation: use "ChatGPT-Account-Id" header (capital letters)
      const headers: Record<string, string> = {};
      if (accountId) {
        headers["ChatGPT-Account-Id"] = accountId;
      }
      // Add OpenAI-Organization if present in token (for org-scoped tokens)
      const orgId = extractOrgId(credential);
      if (orgId) {
        headers["OpenAI-Organization"] = orgId;
      }
      console.log(`[OpenAIProvider] OAuth headers:`, headers);
      this.client = new OpenAI({
        apiKey: credential, // SDK will add "Bearer " prefix
        defaultHeaders: headers,
      });
    } else {
      console.log(`[OpenAIProvider] API key mode`);
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
    console.log(`[OpenAIProvider] complete() called with model: ${req.model}`);
    try {
      const response = await this.client.chat.completions.create(
        this.buildParams(req)
      );
      console.log(`[OpenAIProvider] complete() successful, model used: ${response.model}`);

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
    } catch (error: any) {
      console.error(`[OpenAIProvider] complete() error:`, {
        status: error?.status,
        code: error?.code,
        message: error?.message,
        type: error?.type
      });

      // Enhanced error message for OAuth scope issues
      if (error?.status === 401 && error?.message?.includes('model.request')) {
        const scopeError = new Error(
          'OpenAI OAuth token is missing required scopes. ' +
          'The token needs the "model.request" scope to call the API. ' +
          'Please re-authenticate with OpenAI OAuth to grant API access permissions.'
        );
        (scopeError as any).status = 401;
        (scopeError as any).code = 'insufficient_oauth_scopes';
        (scopeError as any).originalError = error;
        throw scopeError;
      }

      throw error;
    }
  }

  async *stream(
    req: LLMCompletionRequest
  ): AsyncGenerator<LLMStreamChunk, void, unknown> {
    console.log(`[OpenAIProvider] stream() called with model: ${req.model}`);
    try {
      const response = await this.client.chat.completions.create({
        ...this.buildParams(req),
        stream: true as const,
      });
      console.log(`[OpenAIProvider] stream() created successfully`);

      for await (const chunk of response) {
        const content = chunk.choices[0]?.delta?.content || "";
        const finishReason = chunk.choices[0]?.finish_reason;
        if (content) {
          yield { content, done: false };
        }
        if (finishReason !== null && finishReason !== undefined) {
          console.log(`[OpenAIProvider] stream() completed, model: ${chunk.model}, finishReason: ${finishReason}`);
          yield { content: "", done: true };
        }
      }
    } catch (error: any) {
      console.error(`[OpenAIProvider] stream() error:`, {
        status: error?.status,
        code: error?.code,
        message: error?.message,
        type: error?.type
      });

      // Enhanced error message for OAuth scope issues
      if (error?.status === 401 && error?.message?.includes('model.request')) {
        const scopeError = new Error(
          'OpenAI OAuth token is missing required scopes. ' +
          'The token needs the "model.request" scope to call the API. ' +
          'Please re-authenticate with OpenAI OAuth to grant API access permissions.'
        );
        (scopeError as any).status = 401;
        (scopeError as any).code = 'insufficient_oauth_scopes';
        (scopeError as any).originalError = error;
        throw scopeError;
      }

      throw error;
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
