import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getDb } from "@/db";
import type { LLMProviderName, AuthMode } from "@/types";

// ── OAuth provider configs ───────────────────────────────────────────

const ANTHROPIC_CONFIG = {
  clientId: "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
  authorizeUrl: "https://claude.ai/oauth/authorize",
  redirectUri: "https://console.anthropic.com/oauth/code/callback",
  scopes: "org:create_api_key user:profile user:inference",
};

const OPENAI_CONFIG = {
  clientId: "app_EMoamEEZ73f0CkXaXp7hrann",
  authorizeUrl: "https://auth.openai.com/oauth/authorize",
  redirectUri: "http://localhost:1455/auth/callback",
  scopes: "openid profile email offline_access",
};

// ── PKCE helpers ─────────────────────────────────────────────────────

function generatePKCE() {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url");
  return { verifier, challenge };
}

// ── Route ────────────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  const providerName = provider as LLMProviderName;
  const authMode = (request.nextUrl.searchParams.get("authMode") || "oauth") as AuthMode;

  // Pick config
  let config: typeof ANTHROPIC_CONFIG;
  if (providerName === "anthropic" && authMode === "oauth") {
    config = ANTHROPIC_CONFIG;
  } else if (
    providerName === "openai" &&
    (authMode === "oauth_openai_codex" || authMode === "oauth")
  ) {
    config = OPENAI_CONFIG;
  } else {
    return NextResponse.json(
      { error: `OAuth not available for ${provider} with auth mode ${authMode}` },
      { status: 400 }
    );
  }

  try {
    const { verifier, challenge } = generatePKCE();
    const sessionId = crypto.randomUUID();

    // Store session in Supabase
    const db = getDb();
    const { error: dbError } = await db.from("oauth_sessions").insert({
      session_id: sessionId,
      provider: providerName,
      code_verifier: verifier,
      state: verifier, // Anthropic uses verifier as state
      auth_mode: authMode,
    });
    if (dbError) {
      throw new Error(`Failed to store session: ${dbError.message}`);
    }

    // Build auth URL
    const authParams = new URLSearchParams({
      client_id: config.clientId,
      response_type: "code",
      redirect_uri: config.redirectUri,
      scope: config.scopes,
      code_challenge: challenge,
      code_challenge_method: "S256",
      state: verifier,
    });

    // Anthropic-specific param
    if (providerName === "anthropic") {
      authParams.set("code", "true");
    }

    // OpenAI-specific params
    if (providerName === "openai") {
      authParams.set("id_token_add_organizations", "true");
      authParams.set("codex_cli_simplified_flow", "true");
      authParams.set("originator", "pi");
    }

    const authUrl = `${config.authorizeUrl}?${authParams.toString()}`;

    return NextResponse.json({
      sessionId,
      authUrl,
      authMode,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: `Failed to initiate OAuth: ${err.message}` },
      { status: 500 }
    );
  }
}
