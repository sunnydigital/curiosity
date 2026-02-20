import { NextRequest, NextResponse } from "next/server";
import { getSettingsAsync, updateSettings } from "@/db/queries/settings";
import { getAuthContext } from "@/lib/auth/helpers";
import type { Settings } from "@/types";

function maskSecrets(settings: Settings) {
  return {
    ...settings,
    openaiApiKey: settings.openaiApiKey ? "••••••••" : null,
    anthropicApiKey: settings.anthropicApiKey ? "••••••••" : null,
    geminiApiKey: settings.geminiApiKey ? "••••••••" : null,
    openaiOauthClientId: null,
    openaiOauthClientSecret: null,
    anthropicOauthClientId: null,
    anthropicOauthClientSecret: null,
    geminiOauthClientId: null,
    geminiOauthClientSecret: null,
  };
}

export async function GET(request: NextRequest) {
  try {
    const settings = await getSettingsAsync();
    const auth = await getAuthContext(request);
    return NextResponse.json({
      ...maskSecrets(settings),
      isAdmin: auth.isAdmin,
      oauthStatus: {
        openai: { connected: false, tier: null, available: false },
        anthropic: { connected: false, tier: null, available: false },
        gemini: { connected: false, tier: null, available: false },
        ollama: { connected: false, tier: null, available: false },
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    const body = await request.json();

    // Only admin can update API keys
    if ((body.anthropicApiKey || body.openaiApiKey || body.geminiApiKey) && !auth.isAdmin) {
      return NextResponse.json({ error: "Only admin can update API keys" }, { status: 403 });
    }

    await updateSettings(body);
    const settings = await getSettingsAsync();
    return NextResponse.json({
      ...maskSecrets(settings),
      isAdmin: auth.isAdmin,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth.isAdmin) {
      return NextResponse.json({ error: "Only admin can clear credentials" }, { status: 403 });
    }

    await updateSettings({
      openaiApiKey: null,
      anthropicApiKey: null,
      geminiApiKey: null,
    });

    const settings = await getSettingsAsync();
    return NextResponse.json(maskSecrets(settings));
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
