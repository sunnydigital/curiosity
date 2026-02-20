import { getSettings, getSettingsAsync } from "@/db/queries/settings";
import { getProviderAsync } from "./provider-registry";
import { generateLocalEmbedding } from "./local-embedding-provider";
import type { LLMProviderName } from "@/types";

// Default embedding models per online provider
const DEFAULT_ONLINE_EMBEDDING_MODELS: Partial<Record<LLMProviderName, string>> = {
  openai: "text-embedding-3-small",
  gemini: "gemini-embedding-001",
  ollama: "nomic-embed-text",
};

// Providers that support native embeddings
const EMBEDDING_SUPPORTED_PROVIDERS: LLMProviderName[] = ["openai", "gemini", "ollama"];

// Fallback order for embedding providers when the active provider doesn't support embeddings
const EMBEDDING_FALLBACK_ORDER: LLMProviderName[] = ["openai", "gemini", "ollama"];

export interface EmbeddingResult {
  embedding: number[];
  model: string;
}

/**
 * Resolve the current embedding model name without generating an embedding.
 * Used by the UI to determine which memories are compatible.
 */
export function getCurrentEmbeddingModel(): string {
  // This needs settings synchronously - use a cached fallback
  try {
    const settings = getSettings();
    return _getCurrentEmbeddingModel(settings);
  } catch {
    return 'text-embedding-3-small';
  }
}

function _getCurrentEmbeddingModel(settings: ReturnType<typeof getSettings>): string {

  if (settings.embeddingMode === "local") {
    return settings.localEmbeddingModel;
  }

  let effectiveProvider: LLMProviderName = settings.embeddingProviderOverride
    ? settings.embeddingProvider
    : settings.activeProvider;

  if (!EMBEDDING_SUPPORTED_PROVIDERS.includes(effectiveProvider)) {
    for (const fallback of EMBEDDING_FALLBACK_ORDER) {
      if (fallback === "openai" && settings.openaiApiKey) { effectiveProvider = "openai"; break; }
      else if (fallback === "gemini" && settings.geminiApiKey) { effectiveProvider = "gemini"; break; }
      else if (fallback === "ollama") { effectiveProvider = "ollama"; break; }
    }
  }

  return DEFAULT_ONLINE_EMBEDDING_MODELS[effectiveProvider] || "nomic-embed-text";
}

export async function generateEmbedding(text: string): Promise<EmbeddingResult> {
  const settings = await getSettingsAsync();

  // Check if using local embeddings
  if (settings.embeddingMode === "local") {
    return generateLocalEmbeddingWrapper(text, settings);
  }

  // Online embedding mode
  return generateOnlineEmbedding(text, settings);
}

/**
 * Generate embedding using local backend
 */
async function generateLocalEmbeddingWrapper(
  text: string,
  settings: ReturnType<typeof getSettings>
): Promise<EmbeddingResult> {
  console.log(
    `[Embedding] Using LOCAL backend: ${settings.localEmbeddingBackend}, model: ${settings.localEmbeddingModel}`
  );

  const response = await generateLocalEmbedding(
    text,
    settings.localEmbeddingBackend,
    settings.localEmbeddingModel,
    settings.ollamaBaseUrl
  );

  return { embedding: response.embedding, model: settings.localEmbeddingModel };
}

/**
 * Generate embedding using online API provider
 */
async function generateOnlineEmbedding(
  text: string,
  settings: ReturnType<typeof getSettings>
): Promise<EmbeddingResult> {
  // Resolve the effective embedding provider (follows active provider unless overridden)
  let effectiveProvider: LLMProviderName = settings.embeddingProviderOverride
    ? settings.embeddingProvider
    : settings.activeProvider;

  // If the resolved provider doesn't support embeddings natively, find a fallback
  if (!EMBEDDING_SUPPORTED_PROVIDERS.includes(effectiveProvider)) {
    console.log(`[Embedding] Provider ${effectiveProvider} doesn't support native embeddings, finding fallback...`);

    // Try to find a fallback provider with configured credentials
    let fallbackFound = false;
    for (const fallback of EMBEDDING_FALLBACK_ORDER) {
      try {
        // Check if this fallback provider has credentials configured
        if (fallback === "openai" && settings.openaiApiKey) {
          effectiveProvider = "openai";
          fallbackFound = true;
          break;
        } else if (fallback === "anthropic" && settings.anthropicApiKey) {
          effectiveProvider = "anthropic";
          fallbackFound = true;
          break;
        } else if (fallback === "gemini" && settings.geminiApiKey) {
          effectiveProvider = "gemini";
          fallbackFound = true;
          break;
        } else if (fallback === "ollama") {
          // Ollama doesn't need an API key, but the model must be available
          effectiveProvider = "ollama";
          fallbackFound = true;
          break;
        }
      } catch {
        continue;
      }
    }

    if (!fallbackFound) {
      throw new Error(
        `Provider ${settings.activeProvider} doesn't support embeddings and no fallback provider is configured. ` +
        `Please configure an OpenAI or Gemini API key, use Ollama, or switch to local embeddings.`
      );
    }

    console.log(`[Embedding] Using fallback provider: ${effectiveProvider}`);
  }

  // Always use the default embedding model for whichever provider we resolved to.
  // User-configured embeddingModel may be stale from a different provider.
  const model = DEFAULT_ONLINE_EMBEDDING_MODELS[effectiveProvider] || "nomic-embed-text";

  console.log(`[Embedding] Using ONLINE provider: ${effectiveProvider}, model: ${model}`);

  // Get the provider instance for the effective provider
  const provider = await getProviderAsync(effectiveProvider, settings);
  const response = await provider.embed({
    text,
    model,
  });
  return { embedding: response.embedding, model };
}
