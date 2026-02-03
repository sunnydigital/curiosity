import {
  getProviders as piGetProviders,
  getModels as piGetModels,
} from "@mariozechner/pi-ai";
import type { LLMProviderName } from "@/types";

/** Map our internal provider names to pi-ai's KnownProvider names. */
const TO_PI_PROVIDER: Record<string, string> = {
  openai: "openai",
  anthropic: "anthropic",
  gemini: "google",
};

/** Map pi-ai provider names back to ours. */
const FROM_PI_PROVIDER: Record<string, LLMProviderName> = {
  openai: "openai",
  anthropic: "anthropic",
  google: "gemini",
};

export interface ModelInfo {
  id: string;
  name: string;
  contextWindow: number;
  maxTokens: number;
  reasoning: boolean;
  input: string[];
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
}

/**
 * List all models for a provider using pi-ai's built-in registry.
 * Returns an empty array for providers not in pi-ai (e.g. ollama).
 */
export function listModelsFromRegistry(provider: LLMProviderName): ModelInfo[] {
  const piProvider = TO_PI_PROVIDER[provider];
  if (!piProvider) return [];

  try {
    const models = piGetModels(piProvider as any);
    return models.map((m: any) => ({
      id: m.id,
      name: m.name || m.id,
      contextWindow: m.contextWindow ?? 0,
      maxTokens: m.maxTokens ?? 0,
      reasoning: m.reasoning ?? false,
      input: m.input ?? ["text"],
      cost: {
        input: m.cost?.input ?? 0,
        output: m.cost?.output ?? 0,
        cacheRead: m.cost?.cacheRead ?? 0,
        cacheWrite: m.cost?.cacheWrite ?? 0,
      },
    }));
  } catch {
    return [];
  }
}

/**
 * Get just the model IDs for a provider from the pi-ai registry.
 */
export function listModelIdsFromRegistry(provider: LLMProviderName): string[] {
  return listModelsFromRegistry(provider).map((m) => m.id);
}

/**
 * Get metadata for a specific model. Returns null if not found.
 */
export function getModelMetadata(
  provider: LLMProviderName,
  modelId: string
): ModelInfo | null {
  const models = listModelsFromRegistry(provider);
  return models.find((m) => m.id === modelId) ?? null;
}

/**
 * Get all providers known to pi-ai, mapped to our LLMProviderName.
 * Only returns providers we support internally.
 */
export function getAvailablePiProviders(): LLMProviderName[] {
  const piProviders = piGetProviders();
  return piProviders
    .map((p: string) => FROM_PI_PROVIDER[p])
    .filter((p): p is LLMProviderName => p !== undefined);
}
