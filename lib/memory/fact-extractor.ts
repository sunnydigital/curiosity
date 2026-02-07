import { getSettings } from "@/db/queries/settings";
import { getPreviewProviderAsync, getProviderAsync } from "@/lib/llm/provider-registry";
import { FACT_EXTRACTION_PROMPT } from "@/lib/constants";
import type { LLMProviderName } from "@/types";

export async function extractFacts(
  userMessage: string,
  assistantMessage: string
): Promise<string[]> {
  const settings = getSettings();

  // Resolve the effective preview provider (follows active provider unless overridden)
  const effectiveProvider: LLMProviderName = settings.previewProviderOverride
    ? settings.previewProvider
    : settings.activeProvider;

  const previewModelMap: Record<LLMProviderName, string> = {
    openai: settings.previewOpenaiModel,
    anthropic: settings.previewAnthropicModel,
    gemini: settings.previewGeminiModel,
    ollama: settings.previewOllamaModel,
  };

  const conversationToAnalyze = `User: ${userMessage}\n\nAssistant: ${assistantMessage}`;

  // Try preview provider first, then fall back to active provider
  const attempts: { provider: LLMProviderName; getProvider: () => Promise<any> }[] = [
    { provider: effectiveProvider, getProvider: () => getPreviewProviderAsync(settings) },
  ];

  // Add active provider as fallback if different from preview
  if (effectiveProvider !== settings.activeProvider) {
    attempts.push({
      provider: settings.activeProvider,
      getProvider: () => getProviderAsync(settings.activeProvider, settings),
    });
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
