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
  console.log("[MemoryManager] onNewExchange called, memoryEnabled:", settings.memoryEnabled);

  if (!settings.memoryEnabled) {
    console.log("[MemoryManager] Memory is disabled, skipping");
    return;
  }

  try {
    console.log("[MemoryManager] Extracting facts from exchange...");
    const facts = await extractFacts(userContent, assistantContent);
    console.log("[MemoryManager] Got facts:", facts);

    for (const fact of facts) {
      console.log("[MemoryManager] Generating embedding for:", fact);
      const embedding = await generateEmbedding(fact);
      console.log("[MemoryManager] Creating memory with embedding length:", embedding.length);
      createMemory({
        content: fact,
        sourceChatId: chatId,
        sourceMessageId: userMessageId,
        embedding,
      });
      console.log("[MemoryManager] Memory created successfully");
    }
  } catch (error) {
    console.error("[MemoryManager] Error in onNewExchange:", error);
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
