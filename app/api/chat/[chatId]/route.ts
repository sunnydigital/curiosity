import { NextRequest, NextResponse } from "next/server";
import { getChat, renameChat, deleteChat, starChat } from "@/db/queries/chats";
import { assignChatToProject } from "@/db/queries/projects";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const { chatId } = await params;
  const chat = getChat(chatId);
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
    renameChat(chatId, body.title);
  }
  if (body.starred !== undefined) {
    starChat(chatId, body.starred);
  }
  if (body.projectId !== undefined) {
    assignChatToProject(chatId, body.projectId);
  }
  const chat = getChat(chatId);
  return NextResponse.json(chat);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const { chatId } = await params;
  deleteChat(chatId);
  return NextResponse.json({ success: true });
}
