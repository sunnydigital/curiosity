import { NextRequest } from "next/server";
import { getMessage, deleteMessage } from "@/db/queries/messages";
import { getChatIfOwned } from "@/db/queries/chats";
import { getAuthContext } from "@/lib/auth/helpers";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string; messageId: string }> }
) {
  const { chatId, messageId } = await params;
  const auth = await getAuthContext(request);
  const chat = await getChatIfOwned(chatId, auth.userId, auth.anonId);
  if (!chat) {
    return Response.json({ error: "Chat not found" }, { status: 404 });
  }

  const message = await getMessage(messageId);
  if (!message) {
    return Response.json({ error: "Message not found" }, { status: 404 });
  }

  if (message.chatId !== chatId) {
    return Response.json({ error: "Message does not belong to this chat" }, { status: 400 });
  }

  const deleted = await deleteMessage(messageId);
  if (!deleted) {
    return Response.json(
      { error: "Cannot delete message with children" },
      { status: 400 }
    );
  }

  return Response.json({ success: true });
}
