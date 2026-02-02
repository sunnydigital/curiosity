import { NextRequest, NextResponse } from "next/server";
import { deleteOAuthTokens } from "@/db/queries/oauth-tokens";
import { updateSettings } from "@/db/queries/settings";
import type { LLMProviderName, AuthMode } from "@/types";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  const providerName = provider as LLMProviderName;

  try {
    deleteOAuthTokens(providerName);

    // Reset auth mode back to api_key
    const authModeKey = `${providerName}AuthMode` as const;
    updateSettings({ [authModeKey]: "api_key" as AuthMode });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
