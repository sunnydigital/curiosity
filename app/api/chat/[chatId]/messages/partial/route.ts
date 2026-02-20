import { NextRequest, NextResponse } from "next/server";
import { createMessage } from "@/db/queries/messages";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const { chatId } = await params;
  const body = await request.json();
  const { content, parentId, provider, model } = body;

  if (!content || !parentId) {
    return NextResponse.json(
      { error: "content and parentId are required" },
      { status: 400 }
    );
  }

  const message = await createMessage({
    chatId,
    parentId,
    role: "assistant",
    content,
    provider: provider || null,
    model: model || null,
  });

  return NextResponse.json(message);
}
