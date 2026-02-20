import { NextRequest, NextResponse } from "next/server";
import { getChat, renameChat, deleteChat, starChat } from "@/db/queries/chats";
import { assignChatToProject } from "@/db/queries/projects";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const { chatId } = await params;
  const chat = await getChat(chatId);
  if (!chat) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }
  return NextResponse.json(chat);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const { chatId } = await params;
  const body = await request.json();
  if (body.title !== undefined) {
    await renameChat(chatId, body.title);
  }
  if (body.starred !== undefined) {
    await starChat(chatId, body.starred);
  }
  if (body.projectId !== undefined) {
    await assignChatToProject(chatId, body.projectId);
  }
  const chat = await getChat(chatId);
  return NextResponse.json(chat);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const { chatId } = await params;
  await deleteChat(chatId);
  return NextResponse.json({ success: true });
}
