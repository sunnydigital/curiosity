import { NextRequest, NextResponse } from "next/server";
import { getSettingsAsync, updateSettings } from "@/db/queries/settings";
import { getAuthContext } from "@/lib/auth/helpers";
import { getUserApiKeys, setUserApiKey } from "@/db/queries/user-api-keys";
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

    // Fetch per-user API keys if authenticated
    let userApiKeys: Record<string, string> = {};
    if (auth.userId) {
      const keys = await getUserApiKeys(auth.userId);
      // Mask user keys for the response
      for (const [provider, key] of Object.entries(keys)) {
        userApiKeys[provider] = key ? "••••••••" : "";
      }
    }

    // For non-admin users, don't expose that global keys exist
    const maskedSettings = maskSecrets(settings);
    if (!auth.isAdmin) {
      maskedSettings.openaiApiKey = null;
      maskedSettings.anthropicApiKey = null;
      maskedSettings.geminiApiKey = null;
    }

    return NextResponse.json({
      ...maskedSettings,
      isAdmin: auth.isAdmin,
      userApiKeys,
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

    // Handle per-user API keys
    if (body.userApiKeys && auth.userId) {
      for (const [provider, key] of Object.entries(body.userApiKeys)) {
        if (typeof key === 'string' && key.trim()) {
          await setUserApiKey(auth.userId, provider as any, key.trim());
        }
      }
      delete body.userApiKeys;
    }

    // Only admin can update global API keys in admin_settings
    if ((body.anthropicApiKey || body.openaiApiKey || body.geminiApiKey) && !auth.isAdmin) {
      return NextResponse.json({ error: "Only admin can update global API keys" }, { status: 403 });
    }

    if (Object.keys(body).length > 0) {
      await updateSettings(body);
    }

    const settings = await getSettingsAsync();

    // Fetch updated user keys
    let userApiKeys: Record<string, string> = {};
    if (auth.userId) {
      const keys = await getUserApiKeys(auth.userId);
      for (const [provider, key] of Object.entries(keys)) {
        userApiKeys[provider] = key ? "••••••••" : "";
      }
    }

    return NextResponse.json({
      ...maskSecrets(settings),
      isAdmin: auth.isAdmin,
      userApiKeys,
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
