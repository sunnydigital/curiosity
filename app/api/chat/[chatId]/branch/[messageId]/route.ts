import { NextRequest, NextResponse } from "next/server";
import { deleteBranch, getMessage } from "@/db/queries/messages";
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
        return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }

    try {
        const message = await getMessage(messageId);
        if (!message) {
            return NextResponse.json({ error: "Message not found" }, { status: 404 });
        }
        if (message.chatId !== chatId) {
            return NextResponse.json({ error: "Message does not belong to this chat" }, { status: 400 });
        }
        if (!message.parentId) {
            return NextResponse.json({ error: "Cannot delete root message" }, { status: 400 });
        }

        await deleteBranch(messageId);
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
