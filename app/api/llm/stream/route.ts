import { NextRequest } from "next/server";
import { getSettings } from "@/db/queries/settings";
import { getProvider } from "@/lib/llm/provider-registry";
import { createMessage, getPathToRoot } from "@/db/queries/messages";
import { touchChat, renameChat, getChat } from "@/db/queries/chats";
import { getMemoryContext, onNewExchange } from "@/lib/memory/memory-manager";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/constants";
import type { LLMMessage } from "@/types";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { chatId, content, parentId } = body;

  const userMessage = createMessage({
    chatId,
    parentId: parentId || null,
    role: "user",
    content,
  });

  touchChat(chatId);

  const settings = getSettings();
  const provider = getProvider(settings.activeProvider, settings);

  const contextMessages = getPathToRoot(userMessage.id);

  // Build LLM messages with memory context
  const llmMessages: LLMMessage[] = [
    { role: "system", content: DEFAULT_SYSTEM_PROMPT },
  ];

  // Inject memory context if enabled
  try {
    const memoryContext = await getMemoryContext(content);
    if (memoryContext) {
      llmMessages.push({ role: "system", content: memoryContext });
    }
  } catch {
    // Memory retrieval is best-effort
  }

  llmMessages.push(
    ...contextMessages.map((m) => ({
      role: m.role as LLMMessage["role"],
      content: m.content,
    }))
  );

  const encoder = new TextEncoder();
  let fullContent = "";

  const stream = new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "user_message", message: userMessage })}\n\n`
          )
        );

        const gen = provider.stream({
          model: settings.activeModel,
          messages: llmMessages,
        });

        for await (const chunk of gen) {
          if (chunk.content) {
            fullContent += chunk.content;
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "chunk", content: chunk.content })}\n\n`
              )
            );
          }
          if (chunk.done) {
            const assistantMessage = createMessage({
              chatId,
              parentId: userMessage.id,
              role: "assistant",
              content: fullContent,
              provider: settings.activeProvider,
              model: settings.activeModel,
            });

            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "done", message: assistantMessage })}\n\n`
              )
            );

            // Extract facts for memory (async, non-blocking)
            onNewExchange(chatId, userMessage.id, content, fullContent).catch(
              () => { }
            );

            // Auto-title chat if it's the first exchange
            const chat = getChat(chatId);
            if (chat && chat.title === "New Chat") {
              try {
                const r = await provider.complete({
                  model: settings.activeModel,
                  messages: [
                    {
                      role: "system",
                      content:
                        "Generate a short title (3-6 words) for this conversation. Return only the title, no quotes or punctuation.",
                    },
                    { role: "user", content },
                    { role: "assistant", content: fullContent },
                  ],
                  temperature: 0.7,
                  maxTokens: 30,
                });
                const title = r.content.trim().replace(/^["']|["']$/g, '').slice(0, 50);
                if (title) {
                  renameChat(chatId, title);
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({ type: "title_updated", title })}\n\n`
                    )
                  );
                }
              } catch {
                // Title generation is best-effort
              }
            }

            controller.close();
          }
        }
      } catch (error: any) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", error: error.message })}\n\n`
          )
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
