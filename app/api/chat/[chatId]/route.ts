import { NextRequest, NextResponse } from "next/server";
import { getChat, renameChat, deleteChat, starChat, getChatIfOwned } from "@/db/queries/chats";
import { assignChatToProject } from "@/db/queries/projects";
import { getAuthContext } from "@/lib/auth/helpers";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const { chatId } = await params;
  const auth = await getAuthContext(request);
  const chat = await getChatIfOwned(chatId, auth.userId, auth.anonIp);
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
  const auth = await getAuthContext(request);
  const chat = await getChatIfOwned(chatId, auth.userId, auth.anonIp);
  if (!chat) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }
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
  const updated = await getChat(chatId);
  return NextResponse.json(updated);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const { chatId } = await params;
  const auth = await getAuthContext(request);
  const chat = await getChatIfOwned(chatId, auth.userId, auth.anonIp);
  if (!chat) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }
  await deleteChat(chatId);
  return NextResponse.json({ success: true });
}
