import type { LLMProviderName, AuthMode } from "@/types";
import { getSettings } from "@/db/queries/settings";
import { getPiCredentialsAsync, upsertPiCredentials } from "@/db/queries/oauth-tokens";
import {
  refreshCredentials,
  getApiKeyFromCredentials,
  isCredentialsExpired,
  authModeToPiProvider,
  type PiOAuthProviderId,
} from "./pi-auth";

/**
 * Returns a valid access token (API key) for the given provider.
 * If the token is expired and a refresh token is available, it will be refreshed
 * using pi-ai's provider-specific refresh logic.
 */
export async function getValidAccessToken(
  provider: LLMProviderName
): Promise<string> {
  const settings = getSettings();
  const authModeKey = `${provider}AuthMode` as keyof typeof settings;
  const authMode = (settings[authModeKey] as AuthMode) || "api_key";

  const piProviderId = authModeToPiProvider(provider, authMode);
  if (!piProviderId) {
    throw new Error(
      `No pi-ai OAuth provider mapping for ${provider} with auth mode ${authMode}`
    );
  }

  const credentials = await getPiCredentialsAsync(provider);
  if (!credentials) {
    throw new Error(
      `No OAuth tokens found for ${provider}. Please sign in first.`
    );
  }

  // If not expired, return the API key directly
  if (!isCredentialsExpired(credentials)) {
    return getApiKeyFromCredentials(piProviderId, credentials);
  }

  // Token is expired — try to refresh
  if (!credentials.refresh) {
    throw new Error(
      `OAuth token for ${provider} has expired and no refresh token is available. Please sign in again.`
    );
  }

  try {
    const newCredentials = await refreshCredentials(piProviderId, credentials);
    // Store the refreshed credentials
    upsertPiCredentials(provider, newCredentials);
    return getApiKeyFromCredentials(piProviderId, newCredentials);
  } catch (err: any) {
    throw new Error(
      `Failed to refresh OAuth token for ${provider}: ${err.message}`
    );
  }
}
