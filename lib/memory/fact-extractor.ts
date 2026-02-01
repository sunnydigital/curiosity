import { getSettings } from "@/db/queries/settings";
import { getProvider } from "@/lib/llm/provider-registry";
import { FACT_EXTRACTION_PROMPT } from "@/lib/constants";

export async function extractFacts(
  userMessage: string,
  assistantMessage: string
): Promise<string[]> {
  const settings = getSettings();

  // Use the preview provider for fact extraction (cheaper/faster)
  const provider = getProvider(settings.previewProvider, settings);

  try {
    const response = await provider.complete({
      model: settings.previewModel,
      messages: [
        { role: "system", content: FACT_EXTRACTION_PROMPT },
        { role: "user", content: userMessage },
        { role: "assistant", content: assistantMessage },
      ],
      temperature: 0.3,
      maxTokens: 300,
    });

    const content = response.content.trim();
    // Try to parse as JSON array
    const match = content.match(/\[[\s\S]*\]/);
    if (match) {
      const facts = JSON.parse(match[0]);
      if (Array.isArray(facts)) {
        return facts.filter(
          (f: unknown) => typeof f === "string" && f.trim().length > 0
        );
      }
    }
    return [];
  } catch {
    return [];
  }
}
