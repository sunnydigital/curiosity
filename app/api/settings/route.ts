import { NextRequest, NextResponse } from "next/server";
import { getSettings, updateSettings } from "@/db/queries/settings";
import { getAllOAuthStatus } from "@/db/queries/oauth-tokens";
import { isOAuthAvailable } from "@/lib/oauth/config";
import type { LLMProviderName, Settings } from "@/types";

const PROVIDERS: LLMProviderName[] = ["openai", "anthropic", "gemini", "ollama"];

function maskSecrets(settings: Settings) {
  return {
    ...settings,
    openaiApiKey: settings.openaiApiKey ? "••••••••" : null,
    anthropicApiKey: settings.anthropicApiKey ? "••••••••" : null,
    geminiApiKey: settings.geminiApiKey ? "••••••••" : null,
    openaiOauthClientId: settings.openaiOauthClientId ? "••••••••" : null,
    openaiOauthClientSecret: settings.openaiOauthClientSecret ? "••••••••" : null,
    anthropicOauthClientId: settings.anthropicOauthClientId ? "••••••••" : null,
    anthropicOauthClientSecret: settings.anthropicOauthClientSecret ? "••••••••" : null,
    geminiOauthClientId: settings.geminiOauthClientId ? "••••••••" : null,
    geminiOauthClientSecret: settings.geminiOauthClientSecret ? "••••••••" : null,
  };
}

function buildOAuthStatus(settings: Settings) {
  const connectionStatus = getAllOAuthStatus();
  return PROVIDERS.reduce(
    (acc, provider) => {
      acc[provider] = {
        ...connectionStatus[provider],
        available: isOAuthAvailable(provider, settings),
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
      oauthStatus: buildOAuthStatus(settings),
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
      oauthStatus: buildOAuthStatus(settings),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
