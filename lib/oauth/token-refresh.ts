import type { LLMProviderName } from "@/types";
import {
  getOAuthTokens,
  upsertOAuthTokens,
  isTokenExpired,
} from "@/db/queries/oauth-tokens";
import { getOAuthConfig } from "./config";

/**
 * Returns a valid access token for the given provider.
 * If the token is expired and a refresh token is available, it will be refreshed.
 * Throws if no OAuth tokens exist or refresh fails.
 */
export async function getValidAccessToken(
  provider: LLMProviderName
): Promise<string> {
  const tokens = getOAuthTokens(provider);
  if (!tokens) {
    throw new Error(
      `No OAuth tokens found for ${provider}. Please sign in first.`
    );
  }

  if (!isTokenExpired(tokens)) {
    return tokens.accessToken;
  }

  // Token is expired, attempt refresh
  if (!tokens.refreshToken) {
    throw new Error(
      `OAuth token for ${provider} has expired and no refresh token is available. Please sign in again.`
    );
  }

  const config = getOAuthConfig(provider);
  if (!config) {
    throw new Error(
      `OAuth configuration not available for ${provider}. Check environment variables.`
    );
  }

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: tokens.refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Failed to refresh OAuth token for ${provider}: ${response.status} ${errorBody}`
    );
  }

  const data = await response.json();

  const updatedTokens = {
    ...tokens,
    accessToken: data.access_token,
    refreshToken: data.refresh_token || tokens.refreshToken,
    tokenType: data.token_type || tokens.tokenType,
    expiresAt: data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000).toISOString()
      : tokens.expiresAt,
    scope: data.scope || tokens.scope,
  };

  upsertOAuthTokens(updatedTokens);

  return updatedTokens.accessToken;
}
