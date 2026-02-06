import { getSettings } from "@/db/queries/settings";
import { getPreviewProviderAsync } from "@/lib/llm/provider-registry";
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

  // Use getPreviewProviderAsync which properly resolves OAuth credentials
  const provider = await getPreviewProviderAsync(settings);

  // Select the correct model for the resolved provider
  const previewModelMap: Record<LLMProviderName, string> = {
    openai: settings.previewOpenaiModel,
    anthropic: settings.previewAnthropicModel,
    gemini: settings.previewGeminiModel,
    ollama: settings.previewOllamaModel,
  };
  const model = previewModelMap[effectiveProvider];

  console.log(`[FactExtractor] Using provider: ${effectiveProvider}, model: ${model}`);

  // Format the conversation as a single user message for the LLM to analyze
  const conversationToAnalyze = `User: ${userMessage}\n\nAssistant: ${assistantMessage}`;

  try {
    const response = await provider.complete({
      model,
      messages: [
        { role: "system", content: FACT_EXTRACTION_PROMPT },
        { role: "user", content: conversationToAnalyze },
      ],
      temperature: 0.3,
      maxTokens: 300,
    });

    const content = response.content.trim();
    console.log("[FactExtractor] LLM response:", content);

    // Try to parse as JSON array
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
    console.error("[FactExtractor] Error extracting facts:", error);
    return [];
  }
}
