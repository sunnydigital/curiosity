import { NextRequest, NextResponse } from "next/server";
import { getAllMemories, deleteMemory, deleteAllMemories, deleteMemoriesByEmbeddingModel } from "@/db/queries/memories";
import { getCurrentEmbeddingModel } from "@/lib/llm/embedding";
import { retrieveRelevantMemories } from "@/lib/memory/memory-retrieval";
import { getAuthContext } from "@/lib/auth/helpers";

export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);
  const query = request.nextUrl.searchParams.get("q");

  if (query) {
    try {
      const memories = await retrieveRelevantMemories(query);
      return NextResponse.json(memories);
    } catch (error: any) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  const memories = await getAllMemories(auth.userId);
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
    const auth = await getAuthContext(request);
    const body = await request.json();
    if (body.all) {
      await deleteAllMemories(auth.userId || undefined);
    } else if (body.embeddingModel !== undefined) {
      await deleteMemoriesByEmbeddingModel(body.embeddingModel, auth.userId || undefined);
    } else {
      await deleteMemory(body.id);
    }
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
