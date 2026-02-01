import { getSettings } from "@/db/queries/settings";
import { BaseLLMProvider } from "./types";
import { OpenAIProvider } from "./openai-provider";
import { AnthropicProvider } from "./anthropic-provider";
import { GeminiProvider } from "./gemini-provider";
import { OllamaProvider } from "./ollama-provider";
import type { LLMProviderName, Settings } from "@/types";

export function getProvider(
  providerName?: LLMProviderName,
  settings?: Settings
): BaseLLMProvider {
  const s = settings || getSettings();
  const name = providerName || s.activeProvider;

  switch (name) {
    case "openai":
      if (!s.openaiApiKey) throw new Error("OpenAI API key not configured");
      return new OpenAIProvider(s.openaiApiKey);
    case "anthropic":
      if (!s.anthropicApiKey)
        throw new Error("Anthropic API key not configured");
      return new AnthropicProvider(s.anthropicApiKey);
    case "gemini":
      if (!s.geminiApiKey) throw new Error("Gemini API key not configured");
      return new GeminiProvider(s.geminiApiKey);
    case "ollama":
      return new OllamaProvider(s.ollamaBaseUrl);
    default:
      throw new Error(`Unknown provider: ${name}`);
  }
}

export function getEmbeddingProvider(settings?: Settings): BaseLLMProvider {
  const s = settings || getSettings();
  return getProvider(s.embeddingProvider, s);
}

export function getPreviewProvider(settings?: Settings): BaseLLMProvider {
  const s = settings || getSettings();
  return getProvider(s.previewProvider, s);
}
