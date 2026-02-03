import type { LLMProviderName } from "@/types";

/**
 * Model tier mapping across providers for failover.
 * When failing over to a different provider, we pick the equivalent model
 * from the same quality tier.
 */
export const MODEL_TIER_MAP: Record<string, Record<LLMProviderName, string>> = {
  flagship: {
    openai: "gpt-5",
    anthropic: "claude-opus-4-5-20251101",
    gemini: "gemini-2.5-pro",
    ollama: "llama3.2",
  },
  fast: {
    openai: "gpt-5-mini",
    anthropic: "claude-sonnet-4-5-20250929",
    gemini: "gemini-2.5-flash",
    ollama: "llama3.2",
  },
  mini: {
    openai: "gpt-5-nano",
    anthropic: "claude-haiku-4-5-20251001",
    gemini: "gemini-2.5-flash-lite",
    ollama: "llama3.2",
  },
};

// Default model per provider (used when no tier match is found).
// Safe for client-side import — no pi-ai dependency.
export const DEFAULT_MODELS: Record<LLMProviderName, string> = {
  openai: "gpt-5-mini",
  anthropic: "claude-sonnet-4-5-20250929",
  gemini: "gemini-2.5-flash",
  ollama: "llama3.2",
};

/**
 * Given the original model and the target provider, find the best equivalent model.
 */
export function resolveEquivalentModel(
  originalModel: string,
  targetProvider: LLMProviderName
): string {
  // Check each tier to see if the original model belongs to it
  for (const [, tierModels] of Object.entries(MODEL_TIER_MAP)) {
    const matchesAnyProvider = Object.values(tierModels).includes(originalModel);
    if (matchesAnyProvider) {
      return tierModels[targetProvider];
    }
  }

  // No tier match found, use the default model for the target provider
  return DEFAULT_MODELS[targetProvider];
}
