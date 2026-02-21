import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { upsertPiCredentials } from "@/db/queries/oauth-tokens";
import { updateSettings } from "@/db/queries/settings";
import { fetchSubscriptionTier } from "@/lib/oauth/subscription-info";
import { DEFAULT_MODELS } from "@/lib/llm/model-equivalents";
import type { LLMProviderName, AuthMode } from "@/types";

// ── OAuth provider token configs ─────────────────────────────────────

const ANTHROPIC_TOKEN = {
  tokenUrl: "https://console.anthropic.com/v1/oauth/token",
  clientId: "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
  redirectUri: "https://console.anthropic.com/oauth/code/callback",
  contentType: "application/json" as const,
};

const OPENAI_TOKEN = {
  tokenUrl: "https://auth.openai.com/oauth/token",
  clientId: "app_EMoamEEZ73f0CkXaXp7hrann",
  redirectUri: "http://localhost:1455/auth/callback",
  contentType: "application/x-www-form-urlencoded" as const,
};

// ── JWT helper for OpenAI account ID ─────────────────────────────────

function decodeJwt(token: string): any {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const decoded = Buffer.from(parts[1]!, "base64").toString();
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function getOpenAIAccountId(accessToken: string): string | null {
  const payload = decodeJwt(accessToken);
  const auth = payload?.["https://api.openai.com/auth"];
  const accountId = auth?.chatgpt_account_id;
  return typeof accountId === "string" && accountId.length > 0 ? accountId : null;
}

// ── Route ────────────────────────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  const providerName = provider as LLMProviderName;
  const body = await request.json();
  const { code, sessionId, authMode: authModeParam } = body;

  if (!code) {
    return NextResponse.json({ error: "Missing code" }, { status: 400 });
  }
  if (!sessionId) {
    return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
  }

  const authMode = (authModeParam || "oauth") as AuthMode;

  try {
    // Retrieve session from Supabase
    const db = getDb();
    const { data: session, error: fetchError } = await db
      .from("oauth_sessions")
      .select("*")
      .eq("session_id", sessionId)
      .single();

    if (fetchError || !session) {
      return NextResponse.json(
        { error: "No pending login session. It may have expired." },
        { status: 400 }
      );
    }

    // Delete session immediately (one-time use)
    await db.from("oauth_sessions").delete().eq("session_id", sessionId);

    const codeVerifier = session.code_verifier;

    // Parse code - Anthropic format is "code#state"
    let authCode = code;
    let state: string | undefined;
    if (code.includes("#")) {
      const splits = code.split("#");
      authCode = splits[0];
      state = splits[1];
    }

    // Pick token config
    let tokenConfig: { tokenUrl: string; clientId: string; redirectUri: string; contentType: string };
    if (providerName === "anthropic") {
      tokenConfig = ANTHROPIC_TOKEN;
    } else if (providerName === "openai") {
      tokenConfig = OPENAI_TOKEN;
    } else {
      return NextResponse.json(
        { error: `OAuth exchange not supported for ${provider}` },
        { status: 400 }
      );
    }

    // Exchange code for tokens
    let tokenBody: string;
    let headers: Record<string, string>;

    if (tokenConfig.contentType === "application/json") {
      // Anthropic uses JSON
      headers = { "Content-Type": "application/json" };
      tokenBody = JSON.stringify({
        grant_type: "authorization_code",
        client_id: tokenConfig.clientId,
        code: authCode,
        state: state,
        redirect_uri: tokenConfig.redirectUri,
        code_verifier: codeVerifier,
      });
    } else {
      // OpenAI uses form-urlencoded
      headers = { "Content-Type": "application/x-www-form-urlencoded" };
      tokenBody = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: tokenConfig.clientId,
        code: authCode,
        code_verifier: codeVerifier,
        redirect_uri: tokenConfig.redirectUri,
      }).toString();
    }

    const tokenResponse = await fetch(tokenConfig.tokenUrl, {
      method: "POST",
      headers,
      body: tokenBody,
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      throw new Error(`Token exchange failed: ${errorText}`);
    }

    const tokenData = await tokenResponse.json();

    // Build credentials object
    const expiresAt =
      Date.now() + (tokenData.expires_in || 3600) * 1000 - 5 * 60 * 1000;

    const credentials: any = {
      refresh: tokenData.refresh_token,
      access: tokenData.access_token,
      expires: expiresAt,
    };

    // OpenAI needs accountId
    if (providerName === "openai") {
      const accountId = getOpenAIAccountId(tokenData.access_token);
      if (!accountId) {
        throw new Error("Failed to extract accountId from OpenAI token");
      }
      credentials.accountId = accountId;
    }

    // Fetch subscription tier (best-effort)
    let tier = "unknown";
    let metadata: Record<string, any> = {};
    try {
      const sub = await fetchSubscriptionTier(providerName, tokenData.access_token);
      tier = sub.tier;
      metadata = sub.metadata;
    } catch {
      // Non-fatal
    }

    // Store credentials
    upsertPiCredentials(providerName, credentials, tier as any, metadata);

    // Update settings
    const authModeKey = `${providerName}AuthMode` as const;
    updateSettings({
      [authModeKey]: authMode,
      activeProvider: providerName,
      activeModel:
        (DEFAULT_MODELS as any)[providerName] || DEFAULT_MODELS.openai,
    });

    return NextResponse.json({ success: true, tier });
  } catch (err: any) {
    console.error(`OAuth exchange error for ${provider}:`, err);
    return NextResponse.json(
      {
        error:
          err.message || "An unexpected error occurred during authentication.",
      },
      { status: 500 }
    );
  }
}
