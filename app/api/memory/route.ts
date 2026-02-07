import { NextRequest, NextResponse } from "next/server";
import { getAllMemories, deleteMemory, deleteAllMemories, deleteMemoriesByEmbeddingModel } from "@/db/queries/memories";
import { getCurrentEmbeddingModel } from "@/lib/llm/embedding";
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
  const currentModel = getCurrentEmbeddingModel();
  return NextResponse.json({
    currentEmbeddingModel: currentModel,
    memories: memories.map((m) => ({
      id: m.id,
      content: m.content,
      sourceChatId: m.sourceChatId,
      embeddingModel: m.embeddingModel,
      createdAt: m.createdAt,
      lastAccessedAt: m.lastAccessedAt,
      accessCount: m.accessCount,
      strength: m.strength,
    })),
  });
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    if (body.all) {
      deleteAllMemories();
    } else if (body.embeddingModel !== undefined) {
      deleteMemoriesByEmbeddingModel(body.embeddingModel);
    } else {
      deleteMemory(body.id);
    }
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

