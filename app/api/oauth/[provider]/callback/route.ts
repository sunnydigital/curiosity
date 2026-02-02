import { NextRequest, NextResponse } from "next/server";
import { getOAuthConfig, getCallbackUrl } from "@/lib/oauth/config";
import { upsertOAuthTokens } from "@/db/queries/oauth-tokens";
import { updateSettings } from "@/db/queries/settings";
import { fetchSubscriptionTier } from "@/lib/oauth/subscription-info";
import type { LLMProviderName, AuthMode } from "@/types";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  const providerName = provider as LLMProviderName;

  const config = getOAuthConfig(providerName);
  if (!config) {
    return NextResponse.redirect(
      new URL(`/settings?oauth=error&provider=${provider}&reason=not_configured`, request.url)
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL(`/settings?oauth=error&provider=${provider}&reason=${error}`, request.url)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL(`/settings?oauth=error&provider=${provider}&reason=missing_params`, request.url)
    );
  }

  // Validate state against cookie
  const storedState = request.cookies.get(`oauth_state_${provider}`)?.value;
  if (!storedState || storedState !== state) {
    return NextResponse.redirect(
      new URL(`/settings?oauth=error&provider=${provider}&reason=invalid_state`, request.url)
    );
  }

  // Exchange code for tokens
  try {
    const callbackUrl = getCallbackUrl(providerName);
    const tokenResponse = await fetch(config.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: callbackUrl,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      }),
    });

    if (!tokenResponse.ok) {
      const errorBody = await tokenResponse.text();
      console.error(`OAuth token exchange failed for ${provider}:`, errorBody);
      return NextResponse.redirect(
        new URL(`/settings?oauth=error&provider=${provider}&reason=token_exchange_failed`, request.url)
      );
    }

    const tokenData = await tokenResponse.json();

    // Fetch subscription tier info
    const { tier, metadata } = await fetchSubscriptionTier(
      providerName,
      tokenData.access_token
    );

    // Store tokens
    upsertOAuthTokens({
      provider: providerName,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token || null,
      tokenType: tokenData.token_type || "Bearer",
      expiresAt: tokenData.expires_in
        ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
        : null,
      scope: tokenData.scope || null,
      subscriptionTier: tier,
      subscriptionMetadata: metadata,
    });

    // Update settings to use OAuth auth mode for this provider
    const authModeKey = `${providerName}AuthMode` as const;
    updateSettings({ [authModeKey]: "oauth" as AuthMode });

    const response = NextResponse.redirect(
      new URL(`/settings?oauth=success&provider=${provider}`, request.url)
    );

    // Clear the state cookie
    response.cookies.delete(`oauth_state_${provider}`);

    return response;
  } catch (err: any) {
    console.error(`OAuth callback error for ${provider}:`, err);
    return NextResponse.redirect(
      new URL(`/settings?oauth=error&provider=${provider}&reason=unexpected_error`, request.url)
    );
  }
}
