import { getSettingsAsync } from "@/db/queries/settings";
import { getPreviewProviderAsync, getProviderAsync } from "@/lib/llm/provider-registry";
import { FACT_EXTRACTION_PROMPT } from "@/lib/constants";
import type { LLMProviderName } from "@/types";

export async function extractFacts(
  userMessage: string,
  assistantMessage: string
): Promise<string[]> {
  const settings = await getSettingsAsync();

  // Resolve the effective preview provider (follows active provider unless overridden)
  let effectiveProvider: LLMProviderName = settings.previewProviderOverride
    ? settings.previewProvider
    : settings.activeProvider;

  // Server can't reach local Ollama — fall back to cloud
  if (effectiveProvider === "ollama") {
    const cloudFallbacks: LLMProviderName[] = ["anthropic", "openai", "gemini"];
    for (const fb of cloudFallbacks) {
      try {
        await getProviderAsync(fb, settings);
        effectiveProvider = fb;
        break;
      } catch {}
    }
  }

  const previewModelMap: Record<LLMProviderName, string> = {
    openai: settings.previewOpenaiModel || "gpt-4o-mini",
    anthropic: settings.previewAnthropicModel || "claude-haiku-4-5-20251001",
    gemini: settings.previewGeminiModel || "gemini-2.0-flash",
    ollama: settings.previewOllamaModel || "",
  };

  const conversationToAnalyze = `User: ${userMessage}\n\nAssistant: ${assistantMessage}`;

  // Try effective provider first, then cloud fallbacks
  const attempts: { provider: LLMProviderName; getProvider: () => Promise<any> }[] = [
    { provider: effectiveProvider, getProvider: () => getProviderAsync(effectiveProvider, settings) },
  ];

  // Add cloud fallbacks
  const cloudFallbacks: LLMProviderName[] = ["anthropic", "openai", "gemini"];
  for (const fb of cloudFallbacks) {
    if (fb !== effectiveProvider) {
      attempts.push({
        provider: fb,
        getProvider: () => getProviderAsync(fb, settings),
      });
    }
  }

  for (const attempt of attempts) {
    const model = previewModelMap[attempt.provider];
    console.log(`[FactExtractor] Trying provider: ${attempt.provider}, model: ${model}`);

    try {
      const provider = await attempt.getProvider();
      const response = await provider.complete({
        model,
        messages: [
          { role: "system", content: FACT_EXTRACTION_PROMPT },
          { role: "user", content: conversationToAnalyze },
        ],
        temperature: 0.3,
        maxTokens: 1024,
      });

      let content = response.content.trim();
      console.log("[FactExtractor] LLM response:", content);

      // Strip markdown code fences if present
      content = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");

      const match = content.match(/\[[\s\S]*\]/);
      if (match) {
        const facts = JSON.parse(match[0]);
        if (Array.isArray(facts)) {
          const validFacts = facts.filter(
            (f: unknown) => typeof f === "string" && f.trim().length > 0
          );
          console.log("[FactExtractor] Extracted facts:", validFacts);
          return validFacts;
        }
      }
      console.log("[FactExtractor] No valid JSON array found in response");
      return [];
    } catch (error) {
      console.warn(`[FactExtractor] Failed with ${attempt.provider}:`, (error as Error).message);
    }
  }

  console.error("[FactExtractor] All providers failed");
  return [];
}
