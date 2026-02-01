import { NextRequest, NextResponse } from "next/server";
import { getMessagesByChat, createMessage, getPathToRoot } from "@/db/queries/messages";
import { touchChat, renameChat, getChat } from "@/db/queries/chats";
import { getSettings } from "@/db/queries/settings";
import { getProvider } from "@/lib/llm/provider-registry";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/constants";
import type { LLMMessage } from "@/types";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const { chatId } = await params;
  const messages = getMessagesByChat(chatId);
  return NextResponse.json(messages);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const { chatId } = await params;
  const body = await request.json();
  const { content, parentId } = body;

  const userMessage = createMessage({
    chatId,
    parentId: parentId || null,
    role: "user",
    content,
  });

  touchChat(chatId);

  const settings = getSettings();
  const provider = getProvider(settings.activeProvider, settings);

  const contextMessages = parentId
    ? getPathToRoot(userMessage.id)
    : [userMessage];

  const llmMessages: LLMMessage[] = [
    { role: "system", content: DEFAULT_SYSTEM_PROMPT },
    ...contextMessages.map((m) => ({
      role: m.role as LLMMessage["role"],
      content: m.content,
    })),
  ];

  const response = await provider.complete({
    model: settings.activeModel,
    messages: llmMessages,
  });

  const assistantMessage = createMessage({
    chatId,
    parentId: userMessage.id,
    role: "assistant",
    content: response.content,
    provider: settings.activeProvider,
    model: settings.activeModel,
  });

  // Auto-title: if this is the first exchange, generate a title
  const chat = getChat(chatId);
  if (chat && chat.title === "New Chat") {
    try {
      const titleResponse = await provider.complete({
        model: settings.activeModel,
        messages: [
          {
            role: "system",
            content:
              "Generate a short title (3-6 words) for this conversation. Return only the title, no quotes or punctuation.",
          },
          { role: "user", content },
          { role: "assistant", content: response.content },
        ],
      });
      const title = titleResponse.content.trim().slice(0, 50);
      if (title) renameChat(chatId, title);
    } catch {
      // ignore title generation errors
    }
  }

  return NextResponse.json({
    userMessage,
    assistantMessage,
  });
}
