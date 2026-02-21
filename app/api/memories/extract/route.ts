import { NextRequest, NextResponse } from "next/server";
import { createMemory } from "@/db/queries/memories";
import { getAuthContext } from "@/lib/auth/helpers";
import { getSettingsAsync } from "@/db/queries/settings";
import { extractFacts } from "@/lib/memory/fact-extractor";
import { generateEmbedding } from "@/lib/llm/embedding";

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    const { userContent, assistantContent, chatId, messageId } = await request.json();

    const settings = await getSettingsAsync();
    if (!settings.memoryEnabled) {
      return NextResponse.json({ created: 0, reason: "memory_disabled" });
    }

    const facts = await extractFacts(userContent, assistantContent);
    if (facts.length === 0) {
      return NextResponse.json({ created: 0 });
    }

    let created = 0;
    for (const fact of facts) {
      let embedding: number[] = [];
      let embeddingModel: string | null = null;

      try {
        const result = await generateEmbedding(fact);
        embedding = result.embedding;
        embeddingModel = result.model;
      } catch (err) {
        console.warn("[MemoriesExtract] Embedding failed, storing without:", (err as Error).message);
        // Store with empty embedding — memory still appears in panel, just no semantic search
      }

      await createMemory({
        content: fact,
        sourceChatId: chatId || null,
        sourceMessageId: messageId || null,
        embedding,
        embeddingModel,
        userId: auth.userId || null,
      });
      created++;
    }

    return NextResponse.json({ created });
  } catch (error: any) {
    console.error("[MemoriesExtract] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
