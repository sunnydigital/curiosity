import { NextRequest, NextResponse } from "next/server";
import { updateMemoryEmbedding } from "@/db/queries/memories";

/**
 * POST /api/memory/reembed-update
 * Accepts a pre-computed embedding (from client-side Ollama) and saves it.
 * Body: { id: string, embedding: number[], model: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, embedding, model } = body;

    if (!id || !embedding || !model) {
      return NextResponse.json({ error: "Missing id, embedding, or model" }, { status: 400 });
    }

    await updateMemoryEmbedding(id, embedding, model);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
