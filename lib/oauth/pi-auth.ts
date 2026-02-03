/**
 * Bridge layer between @mariozechner/pi-ai's OAuth system and our Next.js web app.
 *
 * pi-ai provides login functions, token refresh, and API key extraction for:
 *   - Anthropic (Claude Pro/Max)           — code-paste flow, no local server
 *   - GitHub Copilot                       — device-code flow, no local server
 *   - Google Gemini CLI                    — local server + manual code fallback
 *   - Google Antigravity (Cloud Code)      — local server + manual code fallback
 *   - OpenAI Codex (ChatGPT Plus/Pro)      — local server + manual code fallback
 *
 * For providers that start a local callback server, we provide the `onManualCodeInput`
 * callback which races against the server.  The user pastes the redirect URL / code
 * from their browser and the manual path wins the race.
 */

import {
  getOAuthProvider,
  getOAuthProviders,
  type OAuthCredentials,
  type OAuthLoginCallbacks,
} from "@mariozechner/pi-ai";
import crypto from "crypto";
import type { LLMProviderName, AuthMode } from "@/types";

// ── Types ────────────────────────────────────────────────────────────

export type PiOAuthProviderId =
  | "anthropic"
  | "github-copilot"
  | "google-gemini-cli"
  | "google-antigravity"
  | "openai-codex";

export type { OAuthCredentials };

export interface PendingLogin {
  sessionId: string;
  authUrl: string;
  /** Extra instructions from the provider (e.g. device code for GitHub Copilot). */
  instructions?: string;
  /** Promise that resolves to credentials once the user submits their code. */
  credentialsPromise: Promise<OAuthCredentials>;
}

interface PendingLoginEntry {
  resolveCode: (code: string) => void;
  rejectCode: (err: Error) => void;
  credentialsPromise: Promise<OAuthCredentials>;
  authUrl: string;
  instructions?: string;
  createdAt: number;
}

// ── In-memory pending login sessions ─────────────────────────────────

const pendingLogins = new Map<string, PendingLoginEntry>();

// Auto-expire stale sessions after 10 minutes
const SESSION_TTL_MS = 10 * 60 * 1000;

function cleanExpiredSessions() {
  const now = Date.now();
  for (const [id, entry] of pendingLogins) {
    if (now - entry.createdAt > SESSION_TTL_MS) {
      entry.rejectCode(new Error("Login session expired"));
      pendingLogins.delete(id);
    }
  }
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Start an OAuth login flow for the given pi-ai provider.
 *
 * Returns a session ID and the auth URL to show the user.
 * The credentials promise resolves once `completeLogin()` is called
 * with the code the user pastes.
 */
export function startLogin(providerId: PiOAuthProviderId): PendingLogin {
  cleanExpiredSessions();

  const provider = getOAuthProvider(providerId);
  if (!provider) {
    throw new Error(`Unknown OAuth provider: ${providerId}`);
  }

  const sessionId = crypto.randomUUID();
  let resolveCode!: (code: string) => void;
  let rejectCode!: (err: Error) => void;
  const codePromise = new Promise<string>((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });

  let resolveAuthUrl!: (url: string) => void;
  const authUrlPromise = new Promise<string>((resolve) => {
    resolveAuthUrl = resolve;
  });
  let capturedInstructions: string | undefined;

  // Build callbacks for pi-ai's login function
  const callbacks: OAuthLoginCallbacks = {
    onAuth: (info: { url: string; instructions?: string } | string) => {
      if (typeof info === "string") {
        // Some providers pass just a URL string
        resolveAuthUrl(info);
      } else {
        resolveAuthUrl(info.url);
        capturedInstructions = info.instructions;
      }
    },
    onPrompt: async (opts: { message: string; placeholder?: string; allowEmpty?: boolean }) => {
      // Wait for the user to paste their code
      return codePromise;
    },
    onProgress: () => {},
    onManualCodeInput: async () => {
      // This races with the local server callback.
      // Our web app always uses this path — user pastes the redirect URL / code.
      return codePromise;
    },
  };

  // Start the login flow asynchronously
  const credentialsPromise = provider.login(callbacks);

  // We need to wait for the auth URL before returning
  // Store the entry so completeLogin can resolve the code promise
  const entry: PendingLoginEntry = {
    resolveCode,
    rejectCode,
    credentialsPromise,
    authUrl: "", // will be set once resolved
    instructions: undefined,
    createdAt: Date.now(),
  };
  pendingLogins.set(sessionId, entry);

  // Return a wrapper that waits for the auth URL
  return {
    sessionId,
    get authUrl() { return entry.authUrl; },
    get instructions() { return entry.instructions; },
    credentialsPromise,
  };
}

/**
 * Wait for the auth URL to become available from a pending login.
 * Must be called after startLogin(). The auth URL is set asynchronously
 * by pi-ai's login function.
 */
export async function waitForAuthUrl(sessionId: string, timeoutMs = 15000): Promise<{ authUrl: string; instructions?: string }> {
  const entry = pendingLogins.get(sessionId);
  if (!entry) {
    throw new Error(`No pending login session: ${sessionId}`);
  }

  // Poll for the auth URL (set by the onAuth callback)
  const start = Date.now();
  while (!entry.authUrl && Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 100));
  }

  if (!entry.authUrl) {
    entry.rejectCode(new Error("Timed out waiting for auth URL"));
    pendingLogins.delete(sessionId);
    throw new Error("Timed out waiting for authorization URL from provider");
  }

  return { authUrl: entry.authUrl, instructions: entry.instructions };
}

/**
 * Complete a pending OAuth login by providing the code/URL the user pasted.
 * Returns the OAuthCredentials from pi-ai.
 */
export async function completeLogin(
  sessionId: string,
  code: string,
): Promise<OAuthCredentials> {
  const entry = pendingLogins.get(sessionId);
  if (!entry) {
    throw new Error(`No pending login session: ${sessionId}. It may have expired.`);
  }

  // Resolve the code promise, which unblocks pi-ai's login function
  entry.resolveCode(code);

  try {
    const credentials = await entry.credentialsPromise;
    return credentials;
  } finally {
    pendingLogins.delete(sessionId);
  }
}

/**
 * Cancel a pending login session.
 */
export function cancelLogin(sessionId: string): void {
  const entry = pendingLogins.get(sessionId);
  if (entry) {
    entry.rejectCode(new Error("Login cancelled"));
    pendingLogins.delete(sessionId);
  }
}

/**
 * Refresh OAuth credentials using pi-ai's provider-specific refresh logic.
 */
export async function refreshCredentials(
  providerId: PiOAuthProviderId,
  credentials: OAuthCredentials,
): Promise<OAuthCredentials> {
  const provider = getOAuthProvider(providerId);
  if (!provider) {
    throw new Error(`Unknown OAuth provider: ${providerId}`);
  }
  return provider.refreshToken(credentials);
}

/**
 * Extract the API key / access token from OAuth credentials.
 * Some providers transform the credentials (e.g. adding account ID).
 */
export function getApiKeyFromCredentials(
  providerId: PiOAuthProviderId,
  credentials: OAuthCredentials,
): string {
  const provider = getOAuthProvider(providerId);
  if (!provider) {
    throw new Error(`Unknown OAuth provider: ${providerId}`);
  }
  return provider.getApiKey(credentials);
}

/**
 * Check if credentials are expired (with 5-minute buffer).
 */
export function isCredentialsExpired(credentials: OAuthCredentials): boolean {
  const bufferMs = 5 * 60 * 1000;
  return Date.now() >= credentials.expires - bufferMs;
}

/**
 * List all available pi-ai OAuth providers.
 */
export function listOAuthProviders(): Array<{ id: string; name: string }> {
  return getOAuthProviders().map((p) => ({ id: p.id, name: p.name }));
}

// ── Internal: Fix the startLogin auth URL capture ────────────────────

// We need to patch startLogin to capture the auth URL synchronously.
// The issue is that provider.login() is async and calls onAuth at some
// point during its execution. We solve this by having startLogin return
// immediately and providing a separate waitForAuthUrl function.

// The onAuth callback in startLogin sets entry.authUrl. The authorize
// route calls startLogin, then awaits waitForAuthUrl to get the URL.

// Patch the startLogin to properly set authUrl via the callback
const _originalStartLogin = startLogin;

// Re-export a version that properly wires up the authUrl capture
export function startLoginSession(providerId: PiOAuthProviderId): { sessionId: string; credentialsPromise: Promise<OAuthCredentials> } {
  cleanExpiredSessions();

  const provider = getOAuthProvider(providerId);
  if (!provider) {
    throw new Error(`Unknown OAuth provider: ${providerId}`);
  }

  const sessionId = crypto.randomUUID();
  let resolveCode!: (code: string) => void;
  let rejectCode!: (err: Error) => void;
  const codePromise = new Promise<string>((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });

  const entry: PendingLoginEntry = {
    resolveCode,
    rejectCode,
    credentialsPromise: null as any, // set below
    authUrl: "",
    instructions: undefined,
    createdAt: Date.now(),
  };

  const callbacks: OAuthLoginCallbacks = {
    onAuth: (info: any) => {
      if (typeof info === "string") {
        entry.authUrl = info;
      } else {
        entry.authUrl = info.url;
        entry.instructions = info.instructions;
      }
    },
    onPrompt: async () => codePromise,
    onProgress: () => {},
    onManualCodeInput: async () => codePromise,
  };

  entry.credentialsPromise = provider.login(callbacks);
  pendingLogins.set(sessionId, entry);

  return { sessionId, credentialsPromise: entry.credentialsPromise };
}

// ── Mapping helpers ──────────────────────────────────────────────────

/**
 * Map our internal AuthMode to a pi-ai OAuth provider ID.
 * Returns null for auth modes that don't use pi-ai OAuth (e.g. api_key, setup-token).
 */
export function authModeToPiProvider(
  provider: LLMProviderName,
  authMode: AuthMode,
): PiOAuthProviderId | null {
  switch (authMode) {
    case "oauth":
      if (provider === "anthropic") return "anthropic";
      return null; // generic oauth for other providers not mapped
    case "oauth_gemini_cli":
      return "google-gemini-cli";
    case "oauth_antigravity":
      return "google-antigravity";
    case "oauth_openai_codex":
      return "openai-codex";
    case "oauth_github_copilot":
      return "github-copilot";
    default:
      return null;
  }
}

/**
 * Determine which LLMProviderName a pi-ai OAuth provider maps to.
 */
export function piProviderToLLMProvider(piId: PiOAuthProviderId): LLMProviderName {
  switch (piId) {
    case "anthropic":
      return "anthropic";
    case "google-gemini-cli":
    case "google-antigravity":
      return "gemini";
    case "openai-codex":
      return "openai";
    case "github-copilot":
      return "openai"; // Copilot routes through OpenAI-compatible endpoint
    default:
      throw new Error(`Unknown pi-ai provider: ${piId}`);
  }
}

/**
 * Check whether a given auth mode uses pi-ai OAuth.
 */
export function isPiOAuthMode(authMode: AuthMode): boolean {
  return authMode !== "api_key";
}

/**
 * Check if pi-ai OAuth is available for a given provider.
 * Returns the list of supported auth modes.
 */
export function getAvailableOAuthModes(provider: LLMProviderName): AuthMode[] {
  switch (provider) {
    case "anthropic":
      return ["oauth"]; // Anthropic PKCE
    case "gemini":
      return ["oauth_gemini_cli", "oauth_antigravity"];
    case "openai":
      return ["oauth_openai_codex"];
    default:
      return [];
  }
}
