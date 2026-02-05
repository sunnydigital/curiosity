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

// ── Custom Gemini CLI provider (skips Cloud Code Assist project discovery) ──
//
// pi-ai's built-in google-gemini-cli provider calls `discoverProject()` after
// the OAuth token exchange, which provisions a Cloud Code Assist project and
// can hang or fail. We only need the OAuth access token to call the public
// generativelanguage.googleapis.com API, so we register a replacement provider
// that performs the same PKCE + local-server OAuth dance but returns
// immediately after the token exchange.

const GEMINI_CLIENT_ID = atob("NjgxMjU1ODA5Mzk1LW9vOGZ0Mm9wcmRybnA5ZTNhcWY2YXYzaG1kaWIxMzVqLmFwcHMuZ29vZ2xldXNlcmNvbnRlbnQuY29t");
const GEMINI_CLIENT_SECRET = atob("R09DU1BYLTR1SGdNUG0tMW83U2stZ2VWNkN1NWNsWEZzeGw=");
const GEMINI_REDIRECT_URI = "http://localhost:8085/oauth2callback";
const GEMINI_SCOPES = [
  "https://www.googleapis.com/auth/cloud-platform",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

// ── Google Antigravity (Cloud Code Assist) provider ──
//
// Antigravity uses different OAuth client credentials from openclaw and provides
// access to non-Google models (like Claude) through Google Cloud infrastructure.
// This requires the full cloud-platform scope and proper project discovery.

const ANTIGRAVITY_CLIENT_ID = atob("MTA3MTAwNjA2MDU5MS10bWhzc2luMmgyMWxjcmUyMzV2dG9sb2poNGc0MDNlcC5hcHBzLmdvb2dsZXVzZXJjb250ZW50LmNvbQ==");
const ANTIGRAVITY_CLIENT_SECRET = atob("R09DU1BYLUs1OEZXUjQ4NkxkTEoxbUxCOHNYQzR6NnFEQWY=");
const ANTIGRAVITY_REDIRECT_URI = "http://localhost:51121/oauth-callback";
const ANTIGRAVITY_SCOPES = [
  "https://www.googleapis.com/auth/cloud-platform",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/cclog",
  "https://www.googleapis.com/auth/experimentsandconfigs",
];

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

async function generatePKCE(): Promise<{ verifier: string; challenge: string }> {
  const array = new Uint8Array(32);
  crypto.getRandomValues
    ? crypto.getRandomValues(array)
    : crypto.randomFillSync(array);
  const verifier = Buffer.from(array).toString("base64url");
  const hash = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier)
  );
  const challenge = Buffer.from(hash).toString("base64url");
  return { verifier, challenge };
}

async function startGeminiCallbackServer(): Promise<{
  server: import("http").Server;
  cancelWait: () => void;
  waitForCode: () => Promise<{ code: string; state: string } | null>;
}> {
  const http = await import("http");
  return new Promise((resolve, reject) => {
    let result: { code: string; state: string } | null = null;
    let cancelled = false;
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || "", "http://localhost:8085");
      if (url.pathname === "/oauth2callback") {
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");
        if (error) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(`<html><body><h1>Authentication Failed</h1><p>${error}</p></body></html>`);
          return;
        }
        if (code && state) {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(`<html><body><h1>Authentication Successful</h1><p>You can close this window.</p></body></html>`);
          result = { code, state };
        } else {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(`<html><body><h1>Authentication Failed</h1><p>Missing code or state.</p></body></html>`);
        }
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    server.on("error", reject);
    server.listen(8085, "127.0.0.1", () => {
      resolve({
        server,
        cancelWait: () => { cancelled = true; },
        waitForCode: async () => {
          while (!result && !cancelled) {
            await new Promise((r) => setTimeout(r, 100));
          }
          return result;
        },
      });
    });
  });
}

async function startAntigravityCallbackServer(): Promise<{
  server: import("http").Server;
  cancelWait: () => void;
  waitForCode: () => Promise<{ code: string; state: string } | null>;
}> {
  const http = await import("http");
  return new Promise((resolve, reject) => {
    let result: { code: string; state: string } | null = null;
    let cancelled = false;
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || "", "http://localhost:51121");
      if (url.pathname === "/oauth-callback") {
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");
        if (error) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(`<html><body><h1>Authentication Failed</h1><p>${error}</p></body></html>`);
          return;
        }
        if (code && state) {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(`<html><body><h1>Authentication Successful</h1><p>You can close this window and return to your app.</p></body></html>`);
          result = { code, state };
        } else {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(`<html><body><h1>Authentication Failed</h1><p>Missing code or state.</p></body></html>`);
        }
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    server.on("error", reject);
    server.listen(51121, "127.0.0.1", () => {
      resolve({
        server,
        cancelWait: () => { cancelled = true; },
        waitForCode: async () => {
          while (!result && !cancelled) {
            await new Promise((r) => setTimeout(r, 100));
          }
          return result;
        },
      });
    });
  });
}

/**
 * Simplified Gemini CLI OAuth: same PKCE + local-server flow as pi-ai,
 * but returns immediately after token exchange (no project discovery).
 */
async function loginGeminiCliSimple(
  onAuth: (info: { url: string; instructions?: string }) => void,
  onProgress?: (message: string) => void,
  onManualCodeInput?: () => Promise<string>,
): Promise<OAuthCredentials> {
  const { verifier, challenge } = await generatePKCE();

  onProgress?.("Starting local server for OAuth callback...");
  const callbackServer = await startGeminiCallbackServer();

  let code: string | undefined;
  try {
    const authParams = new URLSearchParams({
      client_id: GEMINI_CLIENT_ID,
      response_type: "code",
      redirect_uri: GEMINI_REDIRECT_URI,
      scope: GEMINI_SCOPES.join(" "),
      code_challenge: challenge,
      code_challenge_method: "S256",
      state: verifier,
      access_type: "offline",
      prompt: "consent",
    });
    const authUrl = `${GOOGLE_AUTH_URL}?${authParams.toString()}`;
    onAuth({ url: authUrl, instructions: "Complete the sign-in in your browser." });

    onProgress?.("Waiting for OAuth callback...");

    if (onManualCodeInput) {
      // Race: local callback server vs manual code input
      let manualInput: string | undefined;
      let manualError: Error | undefined;
      const manualPromise = onManualCodeInput()
        .then((input) => { manualInput = input; callbackServer.cancelWait(); })
        .catch((err) => { manualError = err instanceof Error ? err : new Error(String(err)); callbackServer.cancelWait(); });

      const result = await callbackServer.waitForCode();
      if (manualError) throw manualError;
      if (result?.code) {
        if (result.state !== verifier) throw new Error("OAuth state mismatch");
        code = result.code;
      } else if (manualInput) {
        try {
          const url = new URL(manualInput.trim());
          code = url.searchParams.get("code") ?? undefined;
        } catch {
          code = manualInput.trim();
        }
      }
      if (!code) {
        await manualPromise;
        if (manualError) throw manualError;
      }
    } else {
      const result = await callbackServer.waitForCode();
      if (result?.code) {
        if (result.state !== verifier) throw new Error("OAuth state mismatch");
        code = result.code;
      }
    }

    if (!code) throw new Error("No authorization code received");

    onProgress?.("Exchanging authorization code for tokens...");
    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: GEMINI_CLIENT_ID,
        client_secret: GEMINI_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: GEMINI_REDIRECT_URI,
        code_verifier: verifier,
      }),
    });
    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      throw new Error(`Token exchange failed: ${error}`);
    }
    const tokenData = await tokenResponse.json();
    if (!tokenData.refresh_token) {
      throw new Error("No refresh token received. Please try again.");
    }

    onProgress?.("Discovering Google Cloud project...");
    const projectId = await discoverProjectId(tokenData.access_token);

    onProgress?.("Connected successfully.");
    return {
      refresh: tokenData.refresh_token,
      access: tokenData.access_token,
      expires: Date.now() + tokenData.expires_in * 1000 - 5 * 60 * 1000,
      projectId,
    } as OAuthCredentials & { projectId: string };
  } finally {
    callbackServer.server.close();
  }
}

/** 
 * Discover the Google Cloud project ID for Code Assist API access.
 * Uses a default fallback project if discovery fails, as the cloud-platform scope
 * only works with the Cloud Code Assist endpoint (not the public API).
 */
async function discoverProjectId(accessToken: string, defaultProject?: string): Promise<string> {
  // Default fallback project (used by openclaw for accounts without projects)
  const DEFAULT_PROJECT = defaultProject || "curiositylm-gemini-default";

  // Check environment variable first
  const envProject = process.env.GOOGLE_CLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT_ID;
  if (envProject) {
    console.log(`[OAuth] Using GOOGLE_CLOUD_PROJECT: ${envProject}`);
    return envProject;
  }

  const CODE_ASSIST_ENDPOINT = "https://cloudcode-pa.googleapis.com";
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "User-Agent": "google-api-nodejs-client/9.15.1",
    "X-Goog-Api-Client": "gl-node/curiosityLM",
  };

  const loadBody = {
    metadata: {
      ideType: "IDE_UNSPECIFIED",
      platform: "PLATFORM_UNSPECIFIED",
      pluginType: "GEMINI",
    },
  };

  try {
    console.log(`[OAuth] Calling ${CODE_ASSIST_ENDPOINT}/v1internal:loadCodeAssist to discover project...`);
    const response = await fetch(`${CODE_ASSIST_ENDPOINT}/v1internal:loadCodeAssist`, {
      method: "POST",
      headers,
      body: JSON.stringify(loadBody),
    });

    console.log(`[OAuth] loadCodeAssist response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`[OAuth] Cloud Code Assist API returned ${response.status}: ${errorText}`);
      console.warn(`[OAuth] Using default project: ${DEFAULT_PROJECT}`);
      return DEFAULT_PROJECT;
    }

    const data = (await response.json()) as {
      cloudaicompanionProject?: string | { id?: string };
    };

    console.log(`[OAuth] loadCodeAssist response data:`, JSON.stringify(data, null, 2));

    const project = data.cloudaicompanionProject;
    if (typeof project === "string" && project) {
      console.log(`[OAuth] Discovered project: ${project}`);
      return project;
    }
    if (typeof project === "object" && project?.id) {
      console.log(`[OAuth] Discovered project: ${project.id}`);
      return project.id;
    }

    console.warn(`[OAuth] No Cloud Code Assist project found, using default project`);
    return DEFAULT_PROJECT;
  } catch (error) {
    console.warn(`[OAuth] Project discovery failed, using default project:`, error);
    return DEFAULT_PROJECT;
  }
}

/**
 * Google Antigravity OAuth: Uses OpenClaw's client credentials for accessing
 * non-Google models (Claude, etc.) through Google Cloud Code Assist.
 * Requires full cloud-platform scope and project discovery.
 */
async function loginAntigravity(
  onAuth: (info: { url: string; instructions?: string }) => void,
  onProgress?: (message: string) => void,
  onManualCodeInput?: () => Promise<string>,
): Promise<OAuthCredentials> {
  const { verifier, challenge } = await generatePKCE();

  onProgress?.("Starting local server for Antigravity OAuth callback...");
  const callbackServer = await startAntigravityCallbackServer();

  let code: string | undefined;
  try {
    const authParams = new URLSearchParams({
      client_id: ANTIGRAVITY_CLIENT_ID,
      response_type: "code",
      redirect_uri: ANTIGRAVITY_REDIRECT_URI,
      scope: ANTIGRAVITY_SCOPES.join(" "),
      code_challenge: challenge,
      code_challenge_method: "S256",
      state: verifier,
      access_type: "offline",
      prompt: "consent",
    });
    const authUrl = `${GOOGLE_AUTH_URL}?${authParams.toString()}`;
    onAuth({ url: authUrl, instructions: "Complete the sign-in in your browser for Google Antigravity access." });

    onProgress?.("Waiting for Antigravity OAuth callback...");

    if (onManualCodeInput) {
      // Race: local callback server vs manual code input
      let manualInput: string | undefined;
      let manualError: Error | undefined;
      const manualPromise = onManualCodeInput()
        .then((input) => { manualInput = input; callbackServer.cancelWait(); })
        .catch((err) => { manualError = err instanceof Error ? err : new Error(String(err)); callbackServer.cancelWait(); });

      const result = await callbackServer.waitForCode();
      if (manualError) throw manualError;
      if (result?.code) {
        if (result.state !== verifier) throw new Error("OAuth state mismatch");
        code = result.code;
      } else if (manualInput) {
        try {
          const url = new URL(manualInput.trim());
          code = url.searchParams.get("code") ?? undefined;
        } catch {
          code = manualInput.trim();
        }
      }
      if (!code) {
        await manualPromise;
        if (manualError) throw manualError;
      }
    } else {
      const result = await callbackServer.waitForCode();
      if (result?.code) {
        if (result.state !== verifier) throw new Error("OAuth state mismatch");
        code = result.code;
      }
    }

    if (!code) throw new Error("No authorization code received");

    onProgress?.("Exchanging authorization code for Antigravity tokens...");
    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: ANTIGRAVITY_CLIENT_ID,
        client_secret: ANTIGRAVITY_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: ANTIGRAVITY_REDIRECT_URI,
        code_verifier: verifier,
      }),
    });
    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      throw new Error(`Antigravity token exchange failed: ${error}`);
    }
    const tokenData = await tokenResponse.json();
    if (!tokenData.refresh_token) {
      throw new Error("No refresh token received from Antigravity. Please try again.");
    }

    onProgress?.("Discovering Google Cloud project for Antigravity...");
    // Try to discover user's own project first, don't fallback to OpenClaw's project
    const projectId = await discoverProjectId(tokenData.access_token, undefined);

    console.log(`[OAuth] Using Antigravity project: ${projectId}`);

    // If we couldn't discover a project, the user needs to create one or use a different auth mode
    if (!projectId || projectId === "curiositylm-gemini-default") {
      console.warn(`[OAuth] No Cloud Code Assist project found for your Google account.`);
      console.warn(`[OAuth] You need either:`);
      console.warn(`[OAuth]   1. A Google Cloud project with Cloud Code Assist API enabled`);
      console.warn(`[OAuth]   2. Or switch to API Key mode in settings`);
    }
    onProgress?.("Antigravity connected successfully.");
    return {
      refresh: tokenData.refresh_token,
      access: tokenData.access_token,
      expires: Date.now() + tokenData.expires_in * 1000 - 5 * 60 * 1000,
      projectId,
    } as OAuthCredentials & { projectId: string };
  } finally {
    callbackServer.server.close();
  }
}

// Register our simplified provider, overriding pi-ai's built-in
registerOAuthProvider({
  id: "google-gemini-cli",
  name: "Google Gemini CLI (simplified)",
  usesCallbackServer: true,
  async login(callbacks: OAuthLoginCallbacks) {
    return loginGeminiCliSimple(
      callbacks.onAuth,
      callbacks.onProgress,
      callbacks.onManualCodeInput,
    );
  },
  async refreshToken(credentials: OAuthCredentials) {
    // Use pi-ai's refresh function — it only hits Google's token endpoint,
    // no project discovery. Pass projectId through to preserve it.
    return refreshGoogleCloudToken(credentials.refresh, (credentials as any).projectId || "");
  },
  getApiKey(credentials: OAuthCredentials) {
    // Always return JSON with token and projectId for Cloud Code Assist API
    const projectId = (credentials as any).projectId || "curiositylm-gemini-default";
    return JSON.stringify({
      token: credentials.access,
      projectId,
    });
  },
} satisfies OAuthProviderInterface);

// Register Google Antigravity provider for accessing non-Google models via Cloud Code Assist
registerOAuthProvider({
  id: "google-antigravity",
  name: "Google Antigravity (Cloud Code Assist)",
  usesCallbackServer: true,
  async login(callbacks: OAuthLoginCallbacks) {
    return loginAntigravity(
      callbacks.onAuth,
      callbacks.onProgress,
      callbacks.onManualCodeInput,
    );
  },
  async refreshToken(credentials: OAuthCredentials) {
    // Use pi-ai's refresh function — it only hits Google's token endpoint,
    // no project discovery. Pass projectId through to preserve it.
    return refreshGoogleCloudToken(credentials.refresh, (credentials as any).projectId || "");
  },
  getApiKey(credentials: OAuthCredentials) {
    // Always return JSON with token and projectId for Cloud Code Assist API
    const projectId = (credentials as any).projectId || "rising-fact-p41fc";
    return JSON.stringify({
      token: credentials.access,
      projectId,
    });
  },
} satisfies OAuthProviderInterface);

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
