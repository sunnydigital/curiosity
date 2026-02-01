import { NextRequest, NextResponse } from "next/server";
import { getAllMemories, createMemory } from "@/db/queries/memories";
import { generateEmbedding } from "@/lib/llm/embedding";
import { retrieveRelevantMemories } from "@/lib/memory/memory-retrieval";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q");

  if (query) {
    try {
      const memories = await retrieveRelevantMemories(query);
      return NextResponse.json(memories);
    } catch (error: any) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  const memories = getAllMemories();
  return NextResponse.json(
    memories.map((m) => ({
      id: m.id,
      content: m.content,
      sourceChatId: m.sourceChatId,
      createdAt: m.createdAt,
      lastAccessedAt: m.lastAccessedAt,
      accessCount: m.accessCount,
      strength: m.strength,
    }))
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { content, sourceChatId } = body;

    const embedding = await generateEmbedding(content);
    const memory = createMemory({
      content,
      sourceChatId: sourceChatId || null,
      embedding,
    });

    return NextResponse.json({
      id: memory.id,
      content: memory.content,
      createdAt: memory.createdAt,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
