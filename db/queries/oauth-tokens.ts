import { getDb } from "@/db";
import type { LLMProviderName, OAuthTokens, PiOAuthCredentials, SubscriptionTier } from "@/types";

export function getOAuthTokens(_provider: LLMProviderName): OAuthTokens | null {
  return null;
}

export function getPiCredentials(_provider: LLMProviderName): PiOAuthCredentials | null {
  return null;
}

export async function getPiCredentialsAsync(provider: LLMProviderName): Promise<PiOAuthCredentials | null> {
  const db = getDb();
  const { data, error } = await db
    .from('oauth_credentials')
    .select('*')
    .eq('provider', provider)
    .single();

  if (error || !data) return null;

  return {
    access: data.access_token,
    refresh: data.refresh_token || undefined,
    expires: data.expires_at,
    accountId: data.account_id || undefined,
  } as any;
}

export function upsertPiCredentials(
  provider: LLMProviderName,
  credentials: PiOAuthCredentials,
  tier?: SubscriptionTier,
  metadata?: Record<string, any>,
): void {
  // Fire-and-forget async
  const db = getDb();
  db.from('oauth_credentials')
    .upsert({
      provider,
      access_token: (credentials as any).access,
      refresh_token: (credentials as any).refresh || null,
      expires_at: (credentials as any).expires,
      account_id: (credentials as any).accountId || null,
      tier: tier || 'unknown',
      metadata: metadata || {},
      updated_at: new Date().toISOString(),
    }, { onConflict: 'provider' })
    .then(() => {})
    .catch((err: any) => console.error('[OAuth] Failed to store credentials:', err));
}

export function upsertOAuthTokens(_tokens: OAuthTokens): void {
  // no-op — using oauth_credentials table instead
}

export async function deleteOAuthCredentials(provider: LLMProviderName): Promise<void> {
  const db = getDb();
  await db.from('oauth_credentials').delete().eq('provider', provider);
}

export function deleteOAuthTokens(provider: LLMProviderName): void {
  deleteOAuthCredentials(provider).catch(() => {});
}

export function isTokenExpired(_tokens: OAuthTokens): boolean {
  return true;
}

export function updateSubscriptionInfo(
  provider: LLMProviderName,
  tier: SubscriptionTier,
  metadata: Record<string, any>
): void {
  const db = getDb();
  db.from('oauth_credentials')
    .update({ tier, metadata, updated_at: new Date().toISOString() })
    .eq('provider', provider)
    .then(() => {})
    .catch(() => {});
}

export async function getAllOAuthStatusAsync(): Promise<Record<
  string,
  { connected: boolean; tier: SubscriptionTier | null; available: boolean }
>> {
  const db = getDb();
  const { data, error } = await db
    .from('oauth_credentials')
    .select('provider, tier, expires_at');

  const result: Record<string, { connected: boolean; tier: SubscriptionTier | null; available: boolean }> = {
    openai: { connected: false, tier: null, available: true },
    anthropic: { connected: false, tier: null, available: true },
    gemini: { connected: false, tier: null, available: false },
    ollama: { connected: false, tier: null, available: false },
  };

  if (!error && data) {
    for (const row of data) {
      if (result[row.provider]) {
        result[row.provider].connected = true;
        result[row.provider].tier = row.tier || null;
      }
    }
  }

  return result;
}

export function getAllOAuthStatus(): Record<
  string,
  { connected: boolean; tier: SubscriptionTier | null }
> {
  // Sync version returns defaults — use getAllOAuthStatusAsync in API routes
  return {
    openai: { connected: false, tier: null },
    anthropic: { connected: false, tier: null },
    gemini: { connected: false, tier: null },
    ollama: { connected: false, tier: null },
  };
}
