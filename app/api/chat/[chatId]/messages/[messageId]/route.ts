import { NextRequest } from "next/server";
import { getMessage, deleteMessage } from "@/db/queries/messages";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ chatId: string; messageId: string }> }
) {
  const { chatId, messageId } = await params;

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
