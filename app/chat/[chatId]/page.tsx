"use client";

import { use } from "react";
import { ChatView } from "@/components/chat/ChatView";

export default function ChatPage({
  params,
}: {
  params: Promise<{ chatId: string }>;
}) {
  const { chatId } = use(params);
  return <ChatView chatId={chatId} />;
}
