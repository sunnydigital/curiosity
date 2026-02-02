import { getSettings } from "@/db/queries/settings";
import type { LLMProviderName, Settings } from "@/types";

export interface OAuthProviderConfig {
  provider: LLMProviderName;
  authorizationUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scopes: string[];
}

const BASE_URL = process.env.NEXTAUTH_URL || "http://localhost:3000";

interface ProviderEndpoints {
  authorizationUrl: string;
  tokenUrl: string;
  scopes: string[];
}

const ENDPOINTS: Partial<Record<LLMProviderName, ProviderEndpoints>> = {
  openai: {
    authorizationUrl: "https://auth.openai.com/authorize",
    tokenUrl: "https://auth.openai.com/token",
    scopes: ["openid", "profile", "model.read", "model.request"],
  },
  anthropic: {
    authorizationUrl: "https://console.anthropic.com/oauth/authorize",
    tokenUrl: "https://console.anthropic.com/oauth/token",
    scopes: ["messages:write", "models:read"],
  },
  gemini: {
    authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: [
      "https://www.googleapis.com/auth/generative-language",
      "https://www.googleapis.com/auth/cloud-platform",
    ],
  },
};

/**
 * Resolve OAuth client credentials for a provider.
 * Priority: env vars > database settings.
 */
function resolveCredentials(
  provider: LLMProviderName,
  settings?: Settings
): { clientId: string; clientSecret: string } | null {
  // Try env vars first
  const envPrefix = provider.toUpperCase();
  const envClientId = process.env[`${envPrefix}_OAUTH_CLIENT_ID`];
  const envClientSecret = process.env[`${envPrefix}_OAUTH_CLIENT_SECRET`];
  if (envClientId && envClientSecret) {
    return { clientId: envClientId, clientSecret: envClientSecret };
  }

  // Fall back to database settings
  const s = settings || getSettings();
  const clientIdKey = `${provider}OauthClientId` as keyof Settings;
  const clientSecretKey = `${provider}OauthClientSecret` as keyof Settings;
  const dbClientId = s[clientIdKey] as string | null;
  const dbClientSecret = s[clientSecretKey] as string | null;
  if (dbClientId && dbClientSecret) {
    return { clientId: dbClientId, clientSecret: dbClientSecret };
  }

  return null;
}

export function getOAuthConfig(
  provider: LLMProviderName,
  settings?: Settings
): OAuthProviderConfig | null {
  const endpoints = ENDPOINTS[provider];
  if (!endpoints) return null;

  const credentials = resolveCredentials(provider, settings);
  if (!credentials) return null;

  return {
    provider,
    ...endpoints,
    ...credentials,
  };
}

export function getCallbackUrl(provider: LLMProviderName): string {
  return `${BASE_URL}/api/oauth/${provider}/callback`;
}

export function isOAuthAvailable(
  provider: LLMProviderName,
  settings?: Settings
): boolean {
  return getOAuthConfig(provider, settings) !== null;
}
