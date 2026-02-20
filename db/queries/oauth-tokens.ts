import { getDb } from "@/db";
import type { LLMProviderName, OAuthTokens, PiOAuthCredentials, SubscriptionTier } from "@/types";

// OAuth tokens are no longer stored locally — OAuth is handled by Supabase Auth.
// These functions are kept as stubs for compatibility.

export function getOAuthTokens(_provider: LLMProviderName): OAuthTokens | null {
  return null;
}

export function getPiCredentials(_provider: LLMProviderName): PiOAuthCredentials | null {
  return null;
}

export function upsertPiCredentials(
  _provider: LLMProviderName,
  _credentials: PiOAuthCredentials,
  _tier?: SubscriptionTier,
  _metadata?: Record<string, any>,
): void {
  // no-op
}

export function upsertOAuthTokens(_tokens: OAuthTokens): void {
  // no-op
}

export function deleteOAuthTokens(_provider: LLMProviderName): void {
  // no-op
}

export function isTokenExpired(_tokens: OAuthTokens): boolean {
  return true;
}

export function updateSubscriptionInfo(
  _provider: LLMProviderName,
  _tier: SubscriptionTier,
  _metadata: Record<string, any>
): void {
  // no-op
}

export function getAllOAuthStatus(): Record<
  string,
  { connected: boolean; tier: SubscriptionTier | null }
> {
  return {
    openai: { connected: false, tier: null },
    anthropic: { connected: false, tier: null },
    gemini: { connected: false, tier: null },
    ollama: { connected: false, tier: null },
  };
}
