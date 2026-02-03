import { NextResponse } from "next/server";
import { getAllOAuthStatus } from "@/db/queries/oauth-tokens";
import { isOAuthAvailable } from "@/lib/oauth/config";
import type { LLMProviderName } from "@/types";

const PROVIDERS: LLMProviderName[] = ["openai", "anthropic", "gemini", "ollama"];

export async function GET() {
  try {
    const connectionStatus = getAllOAuthStatus();

    const status = PROVIDERS.reduce(
      (acc, provider) => {
        acc[provider] = {
          ...connectionStatus[provider],
          available: isOAuthAvailable(provider),
        };
        return acc;
      },
      {} as Record<
        string,
        { connected: boolean; tier: string | null; available: boolean }
      >
    );

    return NextResponse.json(status);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
