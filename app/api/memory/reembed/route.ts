import { NextRequest, NextResponse } from "next/server";
import { getMemoriesByEmbeddingModel, updateMemoryEmbedding } from "@/db/queries/memories";
import { generateEmbedding } from "@/lib/llm/embedding";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const oldModel: string | null = body.oldModel ?? null;

    const memories = getMemoriesByEmbeddingModel(oldModel);
    if (memories.length === 0) {
      return NextResponse.json({ reembedded: 0 });
    }

    let reembedded = 0;
    const errors: string[] = [];

    for (const memory of memories) {
      try {
        const { embedding, model } = await generateEmbedding(memory.content);
        updateMemoryEmbedding(memory.id, embedding, model);
        reembedded++;
      } catch (err: any) {
        errors.push(`Failed to re-embed "${memory.content.slice(0, 50)}...": ${err.message}`);
      }
    }

    return NextResponse.json({ reembedded, total: memories.length, errors });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
