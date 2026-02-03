/**
 * OAuth configuration helpers.
 *
 * With the migration to pi-ai, all OAuth client credentials, endpoints,
 * and PKCE logic are handled internally by pi-ai's provider implementations.
 * This module provides simple availability checks and mapping helpers.
 */

import type { LLMProviderName, AuthMode } from "@/types";
import { getAvailableOAuthModes } from "./pi-auth";

/**
 * Check if OAuth is available for a provider.
 * All pi-ai OAuth providers are always available (built-in credentials).
 */
export function isOAuthAvailable(provider: LLMProviderName): boolean {
  return getAvailableOAuthModes(provider).length > 0;
}

/**
 * Get the list of OAuth auth modes available for a provider.
 */
export function getOAuthModes(provider: LLMProviderName): AuthMode[] {
  return getAvailableOAuthModes(provider);
}
