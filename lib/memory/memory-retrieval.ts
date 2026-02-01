import { getSettings } from "@/db/queries/settings";
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
  const settings = getSettings();
  if (!settings.memoryEnabled) return [];

  try {
    const queryEmbedding = await generateEmbedding(queryText);

    // Search general memories with time decay
    const memories = searchMemories(queryEmbedding, {
      lambda: settings.decayLambda,
      similarityWeight: settings.similarityWeight,
      temporalWeight: settings.temporalWeight,
      topK,
    });

    // Search knowledge base entries (no decay)
    const kbEntries = searchKBEntries(queryEmbedding, topK);

    // Merge and deduplicate
    const results: RetrievedMemory[] = [];

    for (const mem of memories) {
      results.push({
        content: mem.content,
        score: mem.combinedScore,
        source: "memory",
      });
      // Update access metadata
      updateMemoryAccess(mem.id);
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
  } catch {
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
