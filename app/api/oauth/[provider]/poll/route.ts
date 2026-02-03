import { NextRequest, NextResponse } from "next/server";
import { pollLoginSession, getApiKeyFromCredentials, authModeToPiProvider } from "@/lib/oauth/pi-auth";
import { upsertPiCredentials } from "@/db/queries/oauth-tokens";
import { updateSettings } from "@/db/queries/settings";
import { fetchSubscriptionTier } from "@/lib/oauth/subscription-info";
import { DEFAULT_MODELS } from "@/lib/llm/model-equivalents";
import type { LLMProviderName, AuthMode } from "@/types";

/**
 * GET /api/oauth/{provider}/poll?sessionId=...&authMode=...
 *
 * Polls a pending OAuth login session to check if pi-ai's local callback
 * server has already captured the authorization code (e.g. OpenAI Codex
 * redirects to localhost:1455). If credentials are ready, stores them
 * and returns success — same as the exchange endpoint.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  const providerName = provider as LLMProviderName;
  const sessionId = request.nextUrl.searchParams.get("sessionId");
  const authMode = (request.nextUrl.searchParams.get("authMode") || "oauth") as AuthMode;

  if (!sessionId) {
    return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
  }

  const result = pollLoginSession(sessionId);

  if (result === null) {
    // Session not found or expired
    return NextResponse.json({ status: "expired" }, { status: 404 });
  }

  if (!result.resolved) {
    if ("error" in result && result.error) {
      return NextResponse.json({ status: "error", error: result.error });
    }
    const progress = "progress" in result ? result.progress : undefined;
    return NextResponse.json({ status: "pending", ...(progress ? { progress } : {}) });
  }

  // Credentials are ready — complete the same flow as the exchange endpoint
  const credentials = result.credentials;
  const piProviderId = authModeToPiProvider(providerName, authMode);

  try {
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

    upsertPiCredentials(providerName, credentials, tier as any, metadata);

    const authModeKey = `${providerName}AuthMode` as const;
    updateSettings({
      [authModeKey]: authMode,
      activeProvider: providerName,
      activeModel: (DEFAULT_MODELS as any)[providerName] || DEFAULT_MODELS.openai,
    });

    return NextResponse.json({ status: "complete", tier });
  } catch (err: any) {
    console.error(`OAuth poll completion error for ${provider}:`, err);
    return NextResponse.json(
      { error: err.message || "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
