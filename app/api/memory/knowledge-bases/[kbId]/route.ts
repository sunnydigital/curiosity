import { NextRequest, NextResponse } from "next/server";
import { getKnowledgeBase, updateKnowledgeBase, deleteKnowledgeBase } from "@/db/queries/knowledge-bases";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ kbId: string }> }
) {
  const { kbId } = await params;
  const kb = await getKnowledgeBase(kbId);
  if (!kb) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(kb);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ kbId: string }> }
) {
  const { kbId } = await params;
  const body = await request.json();
  await updateKnowledgeBase(kbId, body);
  const kb = await getKnowledgeBase(kbId);
  return NextResponse.json(kb);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ kbId: string }> }
) {
  const { kbId } = await params;
  await deleteKnowledgeBase(kbId);
  return NextResponse.json({ success: true });
}
