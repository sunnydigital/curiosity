import { getSettings } from "@/db/queries/settings";
import { BaseLLMProvider } from "./types";
import { OpenAIProvider } from "./openai-provider";
import { AnthropicProvider } from "./anthropic-provider";
import { GeminiProvider } from "./gemini-provider";
import { OllamaProvider } from "./ollama-provider";
import { getValidAccessToken } from "@/lib/oauth/token-refresh";
import { isPiOAuthMode } from "@/lib/oauth/pi-auth";
import type { LLMProviderName, AuthMode, Settings } from "@/types";

/**
 * Resolve the credential (API key or OAuth token) for a provider.
 * For OAuth mode, this may perform a token refresh if expired.
 */
function getApiKey(
  provider: LLMProviderName,
  settings: Settings
): string | null {
  switch (provider) {
    case "openai":
      return settings.openaiApiKey || null;
    case "anthropic":
      return settings.anthropicApiKey || null;
    case "gemini":
      return settings.geminiApiKey || null;
    default:
      return null;
  }
}

async function resolveCredential(
  provider: LLMProviderName,
  settings: Settings
): Promise<{ credential: string; isOAuthToken: boolean }> {
  const authModeKey = `${provider}AuthMode` as keyof Settings;
  const authMode = (settings[authModeKey] as AuthMode) || "api_key";

  if (isPiOAuthMode(authMode)) {
    try {
      const token = await getValidAccessToken(provider);
      return { credential: token, isOAuthToken: true };
    } catch {
      // OAuth tokens not available yet; fall back to API key if present
      const apiKey = getApiKey(provider, settings);
      if (apiKey) return { credential: apiKey, isOAuthToken: false };
      throw new Error(
        `No OAuth tokens found for ${provider} and no API key configured. Please sign in or add an API key.`
      );
    }
  }

  // API key mode (default)
  const apiKey = getApiKey(provider, settings);
  if (apiKey) return { credential: apiKey, isOAuthToken: false };
  throw new Error(`${provider} API key not configured`);
}

function createProvider(
  name: LLMProviderName,
  credential: string,
  settings: Settings,
  isOAuthToken = false
): BaseLLMProvider {
  switch (name) {
    case "openai":
      return new OpenAIProvider(credential, isOAuthToken);
    case "anthropic":
      return new AnthropicProvider(credential, isOAuthToken);
    case "gemini":
      return new GeminiProvider(credential, isOAuthToken);
    case "ollama":
      return new OllamaProvider(settings.ollamaBaseUrl);
    default:
      throw new Error(`Unknown provider: ${name}`);
  }
}

/**
 * Synchronous provider factory. Works only with API key auth mode.
 * Kept for backwards compatibility with synchronous call sites.
 */
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

/**
 * Async provider factory. Supports both API key and OAuth auth modes.
 * Use this in all new code and async contexts (API routes, etc.).
 */
export async function getProviderAsync(
  providerName?: LLMProviderName,
  settings?: Settings
): Promise<BaseLLMProvider> {
  const s = settings || getSettings();
  const name = providerName || s.activeProvider;

  if (name === "ollama") {
    return new OllamaProvider(s.ollamaBaseUrl);
  }

  const { credential, isOAuthToken } = await resolveCredential(name, s);
  return createProvider(name, credential, s, isOAuthToken);
}

/** Resolve the effective embedding provider (auto-follows active unless overridden). */
function resolveEmbeddingProvider(s: Settings): LLMProviderName {
  return s.embeddingProviderOverride ? s.embeddingProvider : s.activeProvider;
}

/** Resolve the effective preview provider (auto-follows active unless overridden). */
function resolvePreviewProvider(s: Settings): LLMProviderName {
  return s.previewProviderOverride ? s.previewProvider : s.activeProvider;
}

export function getEmbeddingProvider(settings?: Settings): BaseLLMProvider {
  const s = settings || getSettings();
  return getProvider(resolveEmbeddingProvider(s), s);
}

export async function getEmbeddingProviderAsync(
  settings?: Settings
): Promise<BaseLLMProvider> {
  const s = settings || getSettings();
  return getProviderAsync(resolveEmbeddingProvider(s), s);
}

export function getPreviewProvider(settings?: Settings): BaseLLMProvider {
  const s = settings || getSettings();
  return getProvider(resolvePreviewProvider(s), s);
}

export async function getPreviewProviderAsync(
  settings?: Settings
): Promise<BaseLLMProvider> {
  const s = settings || getSettings();
  return getProviderAsync(resolvePreviewProvider(s), s);
}
