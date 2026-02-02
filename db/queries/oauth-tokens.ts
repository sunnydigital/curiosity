import { getDb } from "@/db";
import { encrypt, decrypt } from "@/lib/crypto";
import type { LLMProviderName, OAuthTokens, SubscriptionTier } from "@/types";

interface OAuthTokenRow {
  provider: string;
  access_token: string;
  refresh_token: string | null;
  token_type: string;
  expires_at: string | null;
  scope: string | null;
  subscription_tier: string;
  subscription_metadata: string;
  created_at: string;
  updated_at: string;
}

export function getOAuthTokens(
  provider: LLMProviderName
): OAuthTokens | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM oauth_tokens WHERE provider = ?")
    .get(provider) as OAuthTokenRow | undefined;

  if (!row) return null;

  let metadata: Record<string, any> | null = null;
  try {
    metadata = JSON.parse(row.subscription_metadata || "{}");
  } catch {
    metadata = null;
  }

  return {
    provider: row.provider as LLMProviderName,
    accessToken: decrypt(row.access_token),
    refreshToken: row.refresh_token ? decrypt(row.refresh_token) : null,
    tokenType: row.token_type,
    expiresAt: row.expires_at,
    scope: row.scope,
    subscriptionTier: (row.subscription_tier || "unknown") as SubscriptionTier,
    subscriptionMetadata: metadata,
  };
}

export function upsertOAuthTokens(tokens: OAuthTokens): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO oauth_tokens (provider, access_token, refresh_token, token_type, expires_at, scope, subscription_tier, subscription_metadata, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(provider) DO UPDATE SET
       access_token = excluded.access_token,
       refresh_token = excluded.refresh_token,
       token_type = excluded.token_type,
       expires_at = excluded.expires_at,
       scope = excluded.scope,
       subscription_tier = excluded.subscription_tier,
       subscription_metadata = excluded.subscription_metadata,
       updated_at = datetime('now')`
  ).run(
    tokens.provider,
    encrypt(tokens.accessToken),
    tokens.refreshToken ? encrypt(tokens.refreshToken) : null,
    tokens.tokenType,
    tokens.expiresAt,
    tokens.scope,
    tokens.subscriptionTier || "unknown",
    JSON.stringify(tokens.subscriptionMetadata || {})
  );
}

export function deleteOAuthTokens(provider: LLMProviderName): void {
  const db = getDb();
  db.prepare("DELETE FROM oauth_tokens WHERE provider = ?").run(provider);
}

export function isTokenExpired(tokens: OAuthTokens): boolean {
  if (!tokens.expiresAt) return false;
  const expiresAt = new Date(tokens.expiresAt).getTime();
  const bufferMs = 5 * 60 * 1000; // 5 minute buffer
  return Date.now() >= expiresAt - bufferMs;
}

export function updateSubscriptionInfo(
  provider: LLMProviderName,
  tier: SubscriptionTier,
  metadata: Record<string, any>
): void {
  const db = getDb();
  db.prepare(
    `UPDATE oauth_tokens SET subscription_tier = ?, subscription_metadata = ?, updated_at = datetime('now') WHERE provider = ?`
  ).run(tier, JSON.stringify(metadata), provider);
}

export function getAllOAuthStatus(): Record<
  string,
  { connected: boolean; tier: SubscriptionTier | null }
> {
  const db = getDb();
  const rows = db
    .prepare("SELECT provider, subscription_tier FROM oauth_tokens")
    .all() as { provider: string; subscription_tier: string }[];

  const status: Record<
    string,
    { connected: boolean; tier: SubscriptionTier | null }
  > = {
    openai: { connected: false, tier: null },
    anthropic: { connected: false, tier: null },
    gemini: { connected: false, tier: null },
    ollama: { connected: false, tier: null },
  };

  for (const row of rows) {
    status[row.provider] = {
      connected: true,
      tier: (row.subscription_tier || "unknown") as SubscriptionTier,
    };
  }

  return status;
}
