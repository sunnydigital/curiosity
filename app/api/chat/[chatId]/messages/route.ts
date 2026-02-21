import { NextRequest, NextResponse } from "next/server";
import { getMessagesByChat, createMessage, getPathToRoot } from "@/db/queries/messages";
import { touchChat, renameChat, getChat, getChatIfOwned } from "@/db/queries/chats";
import { getSettingsAsync } from "@/db/queries/settings";
import { getProviderAsync } from "@/lib/llm/provider-registry";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/constants";
import { getAuthContext } from "@/lib/auth/helpers";
import type { LLMMessage } from "@/types";

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
  const messages = await getMessagesByChat(chatId);
  return NextResponse.json(messages);
}

export async function POST(
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
  const { content, parentId, saveOnly } = body;

  // saveOnly: just persist the user message without triggering LLM completion
  // Used by client-side Ollama streaming path
  if (saveOnly) {
    const userMessage = await createMessage({
      chatId,
      parentId: parentId || null,
      role: "user",
      content,
    });
    await touchChat(chatId);
    return NextResponse.json(userMessage);
  }

  const userMessage = await createMessage({
    chatId,
    parentId: parentId || null,
    role: "user",
    content,
  });

  await touchChat(chatId);

  const settings = await getSettingsAsync();
  const provider = await getProviderAsync(settings.activeProvider, settings);

  const contextMessages = parentId
    ? await getPathToRoot(userMessage.id)
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

  const assistantMessage = await createMessage({
    chatId,
    parentId: userMessage.id,
    role: "assistant",
    content: response.content,
    provider: settings.activeProvider,
    model: settings.activeModel,
  });

  const currentChat = await getChat(chatId);
  if (currentChat && currentChat.title === "New Chat") {
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
      if (title) await renameChat(chatId, title);
    } catch {
      // ignore title generation errors
    }
  }

  return NextResponse.json({
    userMessage,
    assistantMessage,
  });
}
