import { getSettings, getSettingsAsync } from "@/db/queries/settings";
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

  console.log(`[Provider] Resolving credential for ${provider}, authMode: ${authMode}`);

  if (isPiOAuthMode(authMode)) {
    console.log(`[Provider] ${provider} is in OAuth mode, attempting to get access token`);
    try {
      const token = await getValidAccessToken(provider);
      console.log(`[Provider] OAuth token obtained for ${provider}`);
      return { credential: token, isOAuthToken: true };
    } catch (error) {
      console.error(`[Provider] OAuth token fetch failed for ${provider}:`, error);
      // OAuth tokens not available yet; fall back to API key if present
      const apiKey = getApiKey(provider, settings);
      if (apiKey) {
        console.log(`[Provider] Falling back to API key for ${provider}`);
        return { credential: apiKey, isOAuthToken: false };
      }
      console.error(`[Provider] No OAuth tokens or API key available for ${provider}`);
      throw new Error(
        `No OAuth tokens found for ${provider} and no API key configured. Please sign in or add an API key.`
      );
    }
  }

  // API key mode (default)
  console.log(`[Provider] ${provider} is in API key mode`);
  const apiKey = getApiKey(provider, settings);
  if (apiKey) {
    console.log(`[Provider] API key found for ${provider}`);
    return { credential: apiKey, isOAuthToken: false };
  }
  console.error(`[Provider] API key not configured for ${provider}`);
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

  console.log(`[Provider] Getting provider async for: ${name}`);

  if (name === "ollama") {
    console.log(`[Provider] Returning Ollama provider with baseUrl: ${s.ollamaBaseUrl}`);
    return new OllamaProvider(s.ollamaBaseUrl);
  }

  const { credential, isOAuthToken } = await resolveCredential(name, s);
  console.log(`[Provider] Creating ${name} provider, isOAuthToken: ${isOAuthToken}`);
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
