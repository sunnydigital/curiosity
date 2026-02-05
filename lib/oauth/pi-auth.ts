/**
 * Bridge layer between @mariozechner/pi-ai's OAuth system and our Next.js web app.
 *
 * pi-ai provides login functions, token refresh, and API key extraction for:
 *   - Anthropic (Claude Pro/Max)           — code-paste flow, no local server
 *   - GitHub Copilot                       — device-code flow, no local server
 *   - OpenAI Codex (ChatGPT Plus/Pro)      — local server + manual code fallback
 *
 * For providers that start a local callback server, we provide the `onManualCodeInput`
 * callback which races against the server.  The user pastes the redirect URL / code
 * from their browser and the manual path wins the race.
 */

import {
  getOAuthProvider,
  getOAuthProviders,
  registerOAuthProvider,
  refreshGoogleCloudToken,
  type OAuthCredentials,
  type OAuthLoginCallbacks,
  type OAuthProviderInterface,
} from "@mariozechner/pi-ai";
import crypto from "crypto";
import type { LLMProviderName, AuthMode } from "@/types";
import { upsertPiCredentials } from "@/db/queries/oauth-tokens";
import { updateSettings } from "@/db/queries/settings";
import { fetchSubscriptionTier } from "@/lib/oauth/subscription-info";
import { DEFAULT_MODELS } from "@/lib/llm/model-equivalents";

// ── Types ────────────────────────────────────────────────────────────

export type PiOAuthProviderId =
  | "anthropic"
  | "github-copilot"
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
  /** Set to true when credentialsPromise resolves (e.g. local server caught callback). */
  resolved: boolean;
  /** Populated when credentialsPromise resolves. */
  credentials: OAuthCredentials | null;
  /** Populated when credentialsPromise rejects. */
  error: string | null;
  /** Latest progress message from the provider (e.g. "Exchanging code..."). */
  progress: string | null;
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
    onProgress: () => { },
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
    resolved: false,
    credentials: null,
    error: null,
    progress: null,
  };
  // Track when credentialsPromise resolves (e.g. local server won the race)
  credentialsPromise.then((creds) => {
    entry.resolved = true;
    entry.credentials = creds;
  }).catch((err) => {
    entry.error = err instanceof Error ? err.message : String(err);
  });
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
 * Poll a pending login session to check if pi-ai's local callback server
 * has already captured the authorization code and resolved credentials.
 * Returns the credentials if resolved, or null if still pending.
 */
export function pollLoginSession(
  sessionId: string,
): { resolved: true; credentials: OAuthCredentials } | { resolved: false; error?: string; progress?: string } | null {
  const entry = pendingLogins.get(sessionId);
  if (!entry) return null; // session not found or expired

  if (entry.resolved && entry.credentials) {
    // Credentials are ready — clean up the session
    pendingLogins.delete(sessionId);
    return { resolved: true, credentials: entry.credentials };
  }

  if (entry.error) {
    pendingLogins.delete(sessionId);
    return { resolved: false, error: entry.error };
  }

  return { resolved: false, progress: entry.progress ?? undefined };
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
 * Check if credentials are expired (with 1-minute safety buffer).
 * Note: some credential sources (e.g. our Gemini CLI login) already
 * subtract a 5-minute buffer at creation time, so we keep this
 * additional buffer small to avoid double-buffering.
 */
export function isCredentialsExpired(credentials: OAuthCredentials): boolean {
  const bufferMs = 60 * 1000; // 1 minute
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
export async function startLoginSession(
  providerId: PiOAuthProviderId,
  persistInfo?: { providerName: LLMProviderName; authMode: AuthMode },
): Promise<{ sessionId: string; credentialsPromise: Promise<OAuthCredentials> }> {
  cleanExpiredSessions();

  // Cancel any existing pending sessions to release resources (e.g. port 8085)
  // before starting a new login for the same provider.
  let hadPending = false;
  for (const [id, entry] of pendingLogins) {
    if (!entry.resolved && !entry.error) {
      entry.rejectCode(new Error("Login cancelled — new session started"));
      pendingLogins.delete(id);
      hadPending = true;
    }
  }
  // Give the old callback server time to close before starting a new one
  if (hadPending) {
    await new Promise((r) => setTimeout(r, 500));
  }

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
    resolved: false,
    credentials: null,
    error: null,
    progress: null,
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
    onProgress: (msg: string) => {
      console.log(`[OAuth] Session ${sessionId} progress: ${msg}`);
      entry.progress = msg;
    },
    onManualCodeInput: async () => codePromise,
  };

  entry.credentialsPromise = provider.login(callbacks);
  // Track when credentialsPromise resolves (e.g. local server won the race).
  // Also auto-persist credentials to DB so they survive HMR resets that
  // clear the in-memory pendingLogins Map before the poll route can read them.
  entry.credentialsPromise.then(async (creds) => {
    console.log(`[OAuth] Session ${sessionId}: credentials received`);
    entry.resolved = true;
    entry.credentials = creds;

    // Auto-persist to DB if provider info was supplied
    if (persistInfo) {
      try {
        let tier = "unknown";
        let metadata: Record<string, any> = {};
        try {
          const apiKey = getApiKeyFromCredentials(providerId, creds);
          const sub = await fetchSubscriptionTier(persistInfo.providerName, apiKey);
          tier = sub.tier;
          metadata = sub.metadata;
        } catch {
          // Non-fatal — tier detection is best-effort
        }
        upsertPiCredentials(persistInfo.providerName, creds, tier as any, metadata);
        const authModeKey = `${persistInfo.providerName}AuthMode` as const;
        updateSettings({
          [authModeKey]: persistInfo.authMode,
          activeProvider: persistInfo.providerName,
          activeModel: (DEFAULT_MODELS as any)[persistInfo.providerName] || DEFAULT_MODELS.openai,
        });
        console.log(`[OAuth] Session ${sessionId}: credentials auto-persisted for ${persistInfo.providerName}`);
      } catch (persistErr) {
        console.error(`[OAuth] Session ${sessionId}: auto-persist failed:`, persistErr);
      }
    }
  }).catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[OAuth] Session ${sessionId}: login failed:`, msg);
    entry.error = msg;
  });
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
    case "openai":
      return ["oauth_openai_codex"];
    default:
      return [];
  }
}
