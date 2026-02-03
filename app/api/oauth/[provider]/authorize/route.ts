import { NextRequest, NextResponse } from "next/server";
import type { LLMProviderName, AuthMode } from "@/types";
import {
  startLoginSession,
  waitForAuthUrl,
  authModeToPiProvider,
} from "@/lib/oauth/pi-auth";

/**
 * GET /api/oauth/{provider}/authorize?authMode=oauth_gemini_cli
 *
 * Initiates an OAuth login flow using pi-ai's built-in provider.
 * Returns JSON with { sessionId, authUrl, instructions }.
 * The frontend opens authUrl in a new tab, then submits the code
 * to /api/oauth/{provider}/exchange with the sessionId.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  const providerName = provider as LLMProviderName;
  const authMode = (request.nextUrl.searchParams.get("authMode") || "oauth") as AuthMode;

  const piProviderId = authModeToPiProvider(providerName, authMode);
  if (!piProviderId) {
    return NextResponse.json(
      { error: `OAuth not available for ${provider} with auth mode ${authMode}` },
      { status: 400 }
    );
  }

  try {
    // Start the login session — this calls pi-ai's provider.login()
    // which generates PKCE, builds the auth URL, and (for some providers)
    // starts a local callback server as a fallback.
    const { sessionId } = startLoginSession(piProviderId);

    // Wait for pi-ai to emit the auth URL via the onAuth callback
    const { authUrl, instructions } = await waitForAuthUrl(sessionId);

    return NextResponse.json({
      sessionId,
      authUrl,
      instructions,
      authMode,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: `Failed to initiate OAuth: ${err.message}` },
      { status: 500 }
    );
  }
}
