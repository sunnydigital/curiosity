import { getSettingsAsync } from "@/db/queries/settings";
import { searchMemories, updateMemoryAccess } from "@/db/queries/memories";
import { searchKBEntries } from "@/db/queries/knowledge-bases";
import { generateEmbedding } from "@/lib/llm/embedding";
import { MEMORY_TOP_K } from "@/lib/constants";

export interface RetrievedMemory {
  content: string;
  score: number;
  source: "memory" | "knowledge_base";
}

export async function retrieveRelevantMemories(
  queryText: string,
  topK: number = MEMORY_TOP_K
): Promise<RetrievedMemory[]> {
  const settings = await getSettingsAsync();
  if (!settings.memoryEnabled) return [];

  try {
    const { embedding: queryEmbedding, model: queryModel } = await generateEmbedding(queryText);

    const memories = await searchMemories(queryEmbedding, {
      lambda: settings.decayLambda,
      similarityWeight: settings.similarityWeight,
      temporalWeight: settings.temporalWeight,
      topK,
      embeddingModel: queryModel,
    });

    const kbEntries = await searchKBEntries(queryEmbedding, topK, undefined, queryModel);

    // Merge and deduplicate
    const results: RetrievedMemory[] = [];

    for (const mem of memories) {
      results.push({
        content: mem.content,
        score: mem.combinedScore,
        source: "memory",
      });
      await updateMemoryAccess(mem.id);
    }

    for (const entry of kbEntries) {
      // Avoid duplicates
      if (results.some((r) => r.content === entry.content)) continue;
      results.push({
        content: entry.content,
        score: entry.similarityScore,
        source: "knowledge_base",
      });
    }

    // Sort by score and take top K
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  } catch (err) {
    console.error("[MemoryRetrieval] Error retrieving memories:", err);
    return [];
  }
}

export function formatMemoriesForContext(
  memories: RetrievedMemory[]
): string | null {
  if (memories.length === 0) return null;

  const lines = memories.map(
    (m) =>
      `- ${m.content} (confidence: ${m.score.toFixed(2)}, source: ${m.source})`
  );

  return `Relevant knowledge from previous conversations:\n${lines.join("\n")}`;
}
