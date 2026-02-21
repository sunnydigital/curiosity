import { NextRequest, NextResponse } from "next/server";
import { createMemory } from "@/db/queries/memories";
import { getAuthContext } from "@/lib/auth/helpers";

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    const { facts, chatId, messageId } = await request.json();

    if (!Array.isArray(facts) || facts.length === 0) {
      return NextResponse.json({ created: 0 });
    }

    let created = 0;
    for (const fact of facts) {
      if (!fact.content || !Array.isArray(fact.embedding)) continue;
      await createMemory({
        content: fact.content,
        sourceChatId: chatId || null,
        sourceMessageId: messageId || null,
        embedding: fact.embedding,
        embeddingModel: fact.embeddingModel || null,
        userId: auth.userId || null,
      });
      created++;
    }

    return NextResponse.json({ created });
  } catch (error: any) {
    console.error("[MemoriesCreate] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
