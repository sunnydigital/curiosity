import { createMemory } from "@/db/queries/memories";
import { generateEmbedding } from "@/lib/llm/embedding";
import { extractFacts } from "./fact-extractor";
import {
  retrieveRelevantMemories,
  formatMemoriesForContext,
} from "./memory-retrieval";
import { getSettings } from "@/db/queries/settings";

export async function onNewExchange(
  chatId: string,
  userMessageId: string,
  userContent: string,
  assistantContent: string
): Promise<void> {
  const settings = getSettings();
  if (!settings.memoryEnabled) return;

  try {
    const facts = await extractFacts(userContent, assistantContent);
    for (const fact of facts) {
      const embedding = await generateEmbedding(fact);
      createMemory({
        content: fact,
        sourceChatId: chatId,
        sourceMessageId: userMessageId,
        embedding,
      });
    }
  } catch {
    // Silently fail - memory extraction is best-effort
  }
}

export async function getMemoryContext(
  currentMessage: string
): Promise<string | null> {
  const settings = getSettings();
  if (!settings.memoryEnabled) return null;

  try {
    const memories = await retrieveRelevantMemories(currentMessage);
    return formatMemoriesForContext(memories);
  } catch {
    return null;
  }
}
