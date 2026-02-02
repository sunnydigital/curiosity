import type {
  LLMProviderName,
  LLMCompletionRequest,
  LLMCompletionResponse,
  LLMStreamChunk,
  FailoverEvent,
  ProviderError,
  Settings,
} from "@/types";
import { getProviderAsync } from "./provider-registry";
import { resolveEquivalentModel } from "./model-equivalents";

export interface FailoverOptions {
  settings: Settings;
  onFailover?: (event: FailoverEvent) => void;
}

export interface FailoverStreamResult {
  generator: AsyncGenerator<LLMStreamChunk, void, unknown>;
  actualProvider: LLMProviderName;
  actualModel: string;
}

/**
 * Classify an error to determine if failover should be attempted.
 */
export function classifyError(
  error: unknown,
  provider: LLMProviderName
): ProviderError {
  const err = error as any;
  const statusCode = err?.status ?? err?.statusCode ?? err?.response?.status;
  const message = err?.message || String(error);

  if (statusCode === 429) {
    return {
      provider,
      statusCode,
      errorType: "rate_limit",
      message: `Rate limited by ${provider}`,
      retryable: true,
    };
  }

  if (statusCode === 401 || statusCode === 403) {
    return {
      provider,
      statusCode,
      errorType: "auth",
      message: `Authentication failed for ${provider}`,
      retryable: false,
    };
  }

  if (statusCode && statusCode >= 500) {
    return {
      provider,
      statusCode,
      errorType: "server",
      message: `Server error from ${provider}: ${statusCode}`,
      retryable: true,
    };
  }

  if (
    message.includes("ETIMEDOUT") ||
    message.includes("ECONNREFUSED") ||
    message.includes("ENOTFOUND") ||
    message.includes("timeout") ||
    message.includes("network")
  ) {
    return {
      provider,
      errorType: "timeout",
      message: `Connection error for ${provider}: ${message}`,
      retryable: true,
    };
  }

  return {
    provider,
    statusCode,
    errorType: "unknown",
    message,
    retryable: true,
  };
}

export class FailoverExecutor {
  private chain: LLMProviderName[];
  private settings: Settings;
  private onFailover?: (event: FailoverEvent) => void;
  private _actualProvider: LLMProviderName;
  private _actualModel: string;

  constructor(options: FailoverOptions) {
    this.settings = options.settings;
    this.onFailover = options.onFailover;
    this._actualProvider = this.settings.activeProvider;
    this._actualModel = this.settings.activeModel;

    // Build deduplicated chain: active provider first, then explicit failover
    // chain, then any remaining providers that have credentials configured
    const seen = new Set<LLMProviderName>();
    this.chain = [];

    const addIfNew = (p: LLMProviderName) => {
      if (!seen.has(p)) {
        seen.add(p);
        this.chain.push(p);
      }
    };

    addIfNew(this.settings.activeProvider);
    for (const p of this.settings.failoverChain) {
      addIfNew(p);
    }

    // Auto-include any provider with a configured credential
    const allProviders: LLMProviderName[] = ["openai", "anthropic", "gemini", "ollama"];
    for (const p of allProviders) {
      if (seen.has(p)) continue;
      if (p === "ollama" && this.settings.ollamaBaseUrl) {
        addIfNew(p);
      } else if (p === "openai" && this.settings.openaiApiKey) {
        addIfNew(p);
      } else if (p === "anthropic" && this.settings.anthropicApiKey) {
        addIfNew(p);
      } else if (p === "gemini" && this.settings.geminiApiKey) {
        addIfNew(p);
      }
    }
  }

  get actualProvider(): LLMProviderName {
    return this._actualProvider;
  }

  get actualModel(): string {
    return this._actualModel;
  }

  async *stream(
    req: LLMCompletionRequest
  ): AsyncGenerator<LLMStreamChunk, void, unknown> {
    for (let i = 0; i < this.chain.length; i++) {
      const providerName = this.chain[i];
      const model =
        providerName === this.settings.activeProvider
          ? req.model
          : resolveEquivalentModel(req.model, providerName);

      try {
        const provider = await getProviderAsync(providerName, this.settings);
        const gen = provider.stream({ ...req, model });

        for await (const chunk of gen) {
          yield chunk;
        }

        this._actualProvider = providerName;
        this._actualModel = model;
        return;
      } catch (error) {
        const classified = classifyError(error, providerName);

        if (i === this.chain.length - 1) {
          throw error;
        }

        if (!classified.retryable && classified.errorType === "auth") {
          // Auth errors are not retryable on the same provider,
          // but we can still try the next provider in the chain
        }

        this.onFailover?.({
          type: "failover",
          fromProvider: providerName,
          toProvider: this.chain[i + 1],
          reason: classified.message,
        });
      }
    }
  }

  async complete(
    req: LLMCompletionRequest
  ): Promise<LLMCompletionResponse> {
    for (let i = 0; i < this.chain.length; i++) {
      const providerName = this.chain[i];
      const model =
        providerName === this.settings.activeProvider
          ? req.model
          : resolveEquivalentModel(req.model, providerName);

      try {
        const provider = await getProviderAsync(providerName, this.settings);
        const response = await provider.complete({ ...req, model });

        this._actualProvider = providerName;
        this._actualModel = model;
        return response;
      } catch (error) {
        const classified = classifyError(error, providerName);

        if (i === this.chain.length - 1) {
          throw error;
        }

        this.onFailover?.({
          type: "failover",
          fromProvider: providerName,
          toProvider: this.chain[i + 1],
          reason: classified.message,
        });
      }
    }

    throw new Error("No providers available in failover chain");
  }
}
