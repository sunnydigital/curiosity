import { NextRequest, NextResponse } from "next/server";
import { getSettingsAsync } from "@/db/queries/settings";
import { getSelectionSummaryPrompt } from "@/lib/constants";
import { getProvider, getProviderAsync } from "@/lib/llm/provider-registry";
import { BaseLLMProvider } from "@/lib/llm/types";
import type { LLMProviderName, Settings, AuthMode } from "@/types";

/** Lightweight chat models for the summary feature. These must support the
 *  chat/completions endpoint (not just completions). We use small/cheap models
 *  since summaries are short and latency matters more than quality here. */
const SUMMARY_MODELS: Record<LLMProviderName, string> = {
  openai: "gpt-5-mini",
  anthropic: "claude-haiku-4-5-20251001",
  gemini: "gemini-3-flash-preview",
  ollama: "qwen3-vl:30b",
};

/**
 * Build an ordered list of { provider, name } candidates for the summary.
 * Prefers API key auth over OAuth, active provider first, Ollama last.
 */
interface SummaryCandidate {
  provider: BaseLLMProvider;
  name: LLMProviderName;
  isOAuth: boolean;
}

async function getSummaryProviders(settings: Settings): Promise<SummaryCandidate[]> {
  const active = settings.activeProvider;

  // Providers to try, starting with the active one
  const candidates: LLMProviderName[] = [active];
  for (const p of ["openai", "anthropic", "gemini", "ollama"] as LLMProviderName[]) {
    if (p !== active) candidates.push(p);
  }

  // Separate Ollama — it always "succeeds" getProvider() since it needs no
  // credentials, so it must be tried last to avoid shadowing OAuth providers.
  const credentialProviders = candidates.filter((p) => p !== "ollama");
  const hasOllama = candidates.includes("ollama");

  const result: SummaryCandidate[] = [];
  const added = new Set<LLMProviderName>();

  // First pass: providers with an API key (bypasses OAuth scope issues).
  // Skip providers whose auth mode is OAuth — their API key field may be
  // stale or absent, and they should go through the OAuth path instead.
  for (const name of credentialProviders) {
    const authModeKey = `${name}AuthMode` as keyof Settings;
    const authMode = (settings[authModeKey] as AuthMode) || "api_key";
    if (authMode !== "api_key") continue;
    try {
      result.push({ provider: getProvider(name, settings), name, isOAuth: false });
      added.add(name);
    } catch {
      // No API key, skip
    }
  }

  // Second pass: providers with OAuth credentials
  for (const name of credentialProviders) {
    if (added.has(name)) continue;
    try {
      result.push({ provider: await getProviderAsync(name, settings), name, isOAuth: true });
      added.add(name);
    } catch (err: any) {
      console.log(`[selection-summary] no credentials for ${name}: ${err.message}`);
    }
  }

  // Last resort: Ollama (local, no credentials)
  if (hasOllama && !added.has("ollama")) {
    try {
      result.push({ provider: getProvider("ollama", settings), name: "ollama", isOAuth: false });
    } catch {
      // Ollama not available
    }
  }

  return result;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const { chatId } = await params;
  const { getChatIfOwned } = await import("@/db/queries/chats");
  const { getAuthContext } = await import("@/lib/auth/helpers");
  const auth = await getAuthContext(request);
  const chat = await getChatIfOwned(chatId, auth.userId, auth.anonId);
  if (!chat) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { selectedText } = body ?? {};

  const textToSummarize = selectedText;

  if (!textToSummarize || typeof textToSummarize !== "string" || !textToSummarize.trim()) {
    return NextResponse.json({ error: "No text to summarize" }, { status: 400 });
  }

  const settings = await getSettingsAsync();
  const sentences = settings.summarySentences ?? 2;
  const summaryPrompt = getSelectionSummaryPrompt(sentences);

  const providers = await getSummaryProviders(settings);
  if (providers.length === 0) {
    return NextResponse.json({ error: "No provider available for summary generation" }, { status: 500 });
  }

  // Try each provider in order; failover on error (e.g. OAuth scope issues)
  let lastError: string = "No providers available";
  for (const { provider, name: providerName, isOAuth } of providers) {
    // OAuth tokens (e.g. OpenAI Codex) can only access subscription models,
    // not arbitrary API models like gpt-4o-mini. Use the active model instead.
    // Per-provider preview models from settings (configured in Settings page)
    const previewModelMap: Record<LLMProviderName, string> = {
      openai: settings.previewOpenaiModel,
      anthropic: settings.previewAnthropicModel,
      gemini: settings.previewGeminiModel,
      ollama: settings.previewOllamaModel,
    };
    const model = (isOAuth && providerName === settings.activeProvider)
      ? settings.activeModel
      : previewModelMap[providerName] || SUMMARY_MODELS[providerName];

    console.log(`[selection-summary] trying provider=${providerName}, model=${model}, oauth=${isOAuth}`);

    const reqParams = {
      model,
      messages: [
        { role: "system" as const, content: summaryPrompt },
        { role: "user" as const, content: textToSummarize },
      ],
      maxTokens: providerName === "ollama"
        ? Math.min(250 * sentences, 3000)   // Ollama thinking models need more headroom
        : sentences <= 2 ? 150
          : sentences <= 5 ? 400
            : sentences <= 7 ? 700
              : 1000,
    };

    try {
      let summaryText: string;

      if (isOAuth) {
        // OAuth tokens (e.g. Codex) may only work with streaming requests.
        // Collect streamed chunks into a single string.
        const streamWithTimeout = async (): Promise<string> => {
          const gen = provider.stream(reqParams);
          let result = "";
          const deadline = Date.now() + 15000;
          for await (const chunk of gen) {
            if (chunk.content) result += chunk.content;
            if (chunk.done) break;
            if (Date.now() > deadline) throw new Error("Summary request timed out");
          }
          return result;
        };
        summaryText = (await streamWithTimeout()).trim();
      } else {
        // API key auth — use non-streaming complete() for simplicity
        const completionPromise = provider.complete(reqParams);
        const timeoutMs = providerName === "ollama" ? 30000 : 15000;
        const timeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Summary request timed out")), timeoutMs)
        );
        const response = await Promise.race([completionPromise, timeout]);
        summaryText = response.content.trim();
      }

      // Strip <think>…</think> blocks from thinking models (e.g. qwen3)
      summaryText = summaryText.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

      if (!summaryText) {
        console.log(`[selection-summary] ${providerName} returned empty response, trying next`);
        lastError = `${providerName} returned empty response`;
        continue;
      }

      console.log(`[selection-summary] success: provider=${providerName}, model=${model}, length=${summaryText.length}`);
      return NextResponse.json({ summary: summaryText });
    } catch (error: any) {
      lastError = error.message || String(error);
      console.log(`[selection-summary] ${providerName} failed: ${lastError}`);
      continue;
    }
  }

  console.error(`[selection-summary] all providers failed. Last error: ${lastError}`);
  return NextResponse.json({ error: lastError }, { status: 500 });
}
