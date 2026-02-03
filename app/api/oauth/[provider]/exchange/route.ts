import { NextRequest, NextResponse } from "next/server";
import { upsertPiCredentials } from "@/db/queries/oauth-tokens";
import { updateSettings } from "@/db/queries/settings";
import { fetchSubscriptionTier } from "@/lib/oauth/subscription-info";
import { completeLogin, authModeToPiProvider, getApiKeyFromCredentials } from "@/lib/oauth/pi-auth";
import { DEFAULT_MODELS } from "@/lib/llm/model-equivalents";
import type { LLMProviderName, AuthMode } from "@/types";

/**
 * POST /api/oauth/{provider}/exchange
 *
 * Complete an OAuth login by submitting the code/URL the user pasted.
 * Requires `sessionId` from the authorize step and the `code` from the user.
 */
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
  const piProviderId = authModeToPiProvider(providerName, authMode);

  try {
    // Resolve the pending login session with the user's code
    const credentials = await completeLogin(sessionId, code);

    // Fetch subscription tier using the access token
    let tier = "unknown";
    let metadata: Record<string, any> = {};
    try {
      const apiKey = piProviderId
        ? getApiKeyFromCredentials(piProviderId, credentials)
        : credentials.access;
      const sub = await fetchSubscriptionTier(providerName, apiKey);
      tier = sub.tier;
      metadata = sub.metadata;
    } catch {
      // Non-fatal — tier detection is best-effort
    }

    // Store credentials in our encrypted DB
    upsertPiCredentials(providerName, credentials, tier as any, metadata);

    // Update the auth mode and switch to this provider
    const authModeKey = `${providerName}AuthMode` as const;
    updateSettings({
      [authModeKey]: authMode,
      activeProvider: providerName,
      activeModel: (DEFAULT_MODELS as any)[providerName] || DEFAULT_MODELS.openai,
    });

    return NextResponse.json({ success: true, tier });
  } catch (err: any) {
    console.error(`OAuth exchange error for ${provider}:`, err);
    return NextResponse.json(
      { error: err.message || "An unexpected error occurred during authentication." },
      { status: 500 }
    );
  }
}
