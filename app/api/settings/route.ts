import { NextRequest, NextResponse } from "next/server";
import { getSettings, updateSettings } from "@/db/queries/settings";
import { getAllOAuthStatus, deleteOAuthTokens } from "@/db/queries/oauth-tokens";
import { isOAuthAvailable } from "@/lib/oauth/config";
import type { LLMProviderName, AuthMode, Settings } from "@/types";

const PROVIDERS: LLMProviderName[] = ["openai", "anthropic", "gemini", "ollama"];

function maskSecrets(settings: Settings) {
  return {
    ...settings,
    openaiApiKey: settings.openaiApiKey ? "••••••••" : null,
    anthropicApiKey: settings.anthropicApiKey ? "••••••••" : null,
    geminiApiKey: settings.geminiApiKey ? "••••••••" : null,
    // OAuth client credentials are no longer stored — omit them
    openaiOauthClientId: null,
    openaiOauthClientSecret: null,
    anthropicOauthClientId: null,
    anthropicOauthClientSecret: null,
    geminiOauthClientId: null,
    geminiOauthClientSecret: null,
  };
}

function buildOAuthStatus() {
  const connectionStatus = getAllOAuthStatus();
  return PROVIDERS.reduce(
    (acc, provider) => {
      acc[provider] = {
        ...connectionStatus[provider],
        available: isOAuthAvailable(provider),
      };
      return acc;
    },
    {} as Record<string, { connected: boolean; tier: string | null; available: boolean }>
  );
}

export async function GET() {
  try {
    const settings = getSettings();
    return NextResponse.json({
      ...maskSecrets(settings),
      oauthStatus: buildOAuthStatus(),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    updateSettings(body);
    const settings = getSettings();
    return NextResponse.json({
      ...maskSecrets(settings),
      oauthStatus: buildOAuthStatus(),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * DELETE /api/settings — Clear all saved credentials (API keys, OAuth tokens, setup tokens).
 * Resets all auth modes back to "api_key".
 */
export async function DELETE() {
  try {
    // Clear all API keys and reset auth modes
    updateSettings({
      openaiApiKey: null,
      anthropicApiKey: null,
      geminiApiKey: null,
      openaiAuthMode: "api_key" as AuthMode,
      anthropicAuthMode: "api_key" as AuthMode,
      geminiAuthMode: "api_key" as AuthMode,
    });

    // Clear all OAuth tokens
    for (const provider of PROVIDERS) {
      deleteOAuthTokens(provider);
    }

    const settings = getSettings();
    return NextResponse.json({
      ...maskSecrets(settings),
      oauthStatus: buildOAuthStatus(),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
