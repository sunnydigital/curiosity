import { NextRequest, NextResponse } from "next/server";
import { upsertPiCredentials } from "@/db/queries/oauth-tokens";
import { updateSettings } from "@/db/queries/settings";
import { fetchSubscriptionTier } from "@/lib/oauth/subscription-info";
import { DEFAULT_MODELS } from "@/lib/llm/model-equivalents";
import type { LLMProviderName, AuthMode } from "@/types";

const ANTHROPIC_SETUP_TOKEN_PREFIXES = ["sk-ant-oat01-", "sk-ant-oat02-", "sk-ant-"];
const ANTHROPIC_SETUP_TOKEN_MIN_LENGTH = 40;

/**
 * Save a long-lived setup token (e.g. from `claude setup-token`).
 * Validates the token against the Anthropic API, stores it as an OAuth
 * access token, and switches auth mode to "oauth".
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  const providerName = provider as LLMProviderName;

  if (providerName !== "anthropic") {
    return NextResponse.json(
      { error: "Setup tokens are only supported for Anthropic." },
      { status: 400 }
    );
  }

  const body = await request.json();
  const token: string = body.token?.trim();

  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  if (!ANTHROPIC_SETUP_TOKEN_PREFIXES.some(p => token.startsWith(p))) {
    return NextResponse.json(
      { error: `Invalid token format. Expected a token starting with sk-ant- (from \`claude setup-token\`).` },
      { status: 400 }
    );
  }

  if (token.length < ANTHROPIC_SETUP_TOKEN_MIN_LENGTH) {
    return NextResponse.json(
      { error: "Token looks too short. Paste the full setup-token." },
      { status: 400 }
    );
  }

  try {
    // Validate the token with a lightweight read-only request (no credits consumed)
    const validationRes = await fetch("https://api.anthropic.com/v1/models", {
      headers: {
        Authorization: `Bearer ${token}`,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "oauth-2025-04-20",
      },
    });

    if (!validationRes.ok && validationRes.status !== 429) {
      const errBody = await validationRes.text();
      if (validationRes.status === 401 || validationRes.status === 403) {
        return NextResponse.json(
          { error: "Invalid or expired setup token. Please generate a new one with `claude setup-token`." },
          { status: 400 }
        );
      }
      if (validationRes.status < 500) {
        return NextResponse.json(
          { error: `Token validation failed: ${validationRes.status} ${errBody}` },
          { status: 400 }
        );
      }
      // 5xx = server-side issue, token may still be valid — proceed
    }

    // Fetch subscription tier using the validated token
    const { tier, metadata } = await fetchSubscriptionTier(providerName, token);

    // Store as OAuth credentials — setup tokens are long-lived (1 year)
    upsertPiCredentials(
      providerName,
      {
        access: token,
        refresh: null,
        expires: Date.now() + 365 * 24 * 60 * 60 * 1000,
      } as any,
      tier as any,
      { method: "setup-token", ...metadata },
    );

    // Switch auth mode to oauth so provider-registry uses Bearer auth,
    // and auto-switch to this provider
    updateSettings({
      anthropicAuthMode: "oauth" as AuthMode,
      activeProvider: providerName,
      activeModel: DEFAULT_MODELS[providerName] || DEFAULT_MODELS.anthropic,
    });

    return NextResponse.json({ success: true, tier });
  } catch (err: any) {
    console.error("Failed to save setup token:", err);
    return NextResponse.json(
      { error: "Failed to save token." },
      { status: 500 }
    );
  }
}
