import { NextRequest, NextResponse } from "next/server";
import {
  listKBEntries,
  addKBEntry,
  deleteKBEntry,
} from "@/db/queries/knowledge-bases";
import { generateEmbedding } from "@/lib/llm/embedding";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ kbId: string }> }
) {
  const { kbId } = await params;
  const entries = listKBEntries(kbId);
  return NextResponse.json(
    entries.map((e) => ({
      id: e.id,
      knowledgeBaseId: e.knowledgeBaseId,
      content: e.content,
      createdAt: e.createdAt,
    }))
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ kbId: string }> }
) {
  const { kbId } = await params;
  const body = await request.json();

  try {
    const embedding = await generateEmbedding(body.content);
    const entry = addKBEntry({
      knowledgeBaseId: kbId,
      content: body.content,
      embedding,
    });

    return NextResponse.json({
      id: entry.id,
      knowledgeBaseId: entry.knowledgeBaseId,
      content: entry.content,
      createdAt: entry.createdAt,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const body = await request.json();
  if (body.entryId) {
    deleteKBEntry(body.entryId);
  }
  return NextResponse.json({ success: true });
}
