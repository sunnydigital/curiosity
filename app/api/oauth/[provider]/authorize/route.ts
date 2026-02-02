import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getOAuthConfig, getCallbackUrl } from "@/lib/oauth/config";
import type { LLMProviderName } from "@/types";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  const providerName = provider as LLMProviderName;

  const config = getOAuthConfig(providerName);
  if (!config) {
    return NextResponse.json(
      { error: `OAuth not available for ${provider}. Check environment variables.` },
      { status: 400 }
    );
  }

  const state = crypto.randomBytes(32).toString("hex");
  const callbackUrl = getCallbackUrl(providerName);

  const authUrl = new URL(config.authorizationUrl);
  authUrl.searchParams.set("client_id", config.clientId);
  authUrl.searchParams.set("redirect_uri", callbackUrl);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", config.scopes.join(" "));
  authUrl.searchParams.set("state", state);

  // For Google, add access_type=offline to get refresh token
  if (providerName === "gemini") {
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");
  }

  const response = NextResponse.redirect(authUrl.toString());

  // Store state in httpOnly cookie for CSRF protection
  response.cookies.set(`oauth_state_${provider}`, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutes
    path: "/",
  });

  return response;
}
