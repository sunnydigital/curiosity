import { NextRequest, NextResponse } from "next/server";
import { deleteBranch, getMessage } from "@/db/queries/messages";

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ chatId: string; messageId: string }> }
) {
    const { chatId, messageId } = await params;

    try {
        // Verify the message exists and belongs to this chat
        const message = getMessage(messageId);
        if (!message) {
            return NextResponse.json({ error: "Message not found" }, { status: 404 });
        }
        if (message.chatId !== chatId) {
            return NextResponse.json({ error: "Message does not belong to this chat" }, { status: 400 });
        }

        // Don't allow deleting the root message
        if (!message.parentId) {
            return NextResponse.json({ error: "Cannot delete root message" }, { status: 400 });
        }

        deleteBranch(messageId);

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
