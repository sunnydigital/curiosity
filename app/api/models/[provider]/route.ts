import { NextRequest, NextResponse } from "next/server";
import { listModelsFromRegistry } from "@/lib/llm/pi-models";
import { OllamaProvider } from "@/lib/llm/ollama-provider";
import { getSettingsAsync } from "@/db/queries/settings";
import type { LLMProviderName } from "@/types";

const VALID_PROVIDERS = new Set(["openai", "anthropic", "gemini", "ollama"]);

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;

  if (!VALID_PROVIDERS.has(provider)) {
    return NextResponse.json({ models: [] }, { status: 400 });
  }

  try {
    if (provider === "ollama") {
      // Ollama models are local — query the running server
      const settings = await getSettingsAsync();
      const ollama = new OllamaProvider(settings.ollamaBaseUrl);
      const ids = await ollama.listModels();
      return NextResponse.json({
        models: ids.map((id) => ({
          id,
          name: id,
          contextWindow: 0,
          maxTokens: 0,
          reasoning: false,
          input: ["text"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        })),
      });
    }

    // Use pi-ai registry for cloud providers
    const models = listModelsFromRegistry(provider as LLMProviderName);
    return NextResponse.json({ models });
  } catch {
    return NextResponse.json({ models: [] });
  }
}
