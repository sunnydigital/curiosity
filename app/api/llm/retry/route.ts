import { NextRequest } from "next/server";
import { getSettings } from "@/db/queries/settings";
import { getProviderAsync, getPreviewProviderAsync } from "@/lib/llm/provider-registry";
import { FailoverExecutor } from "@/lib/llm/failover";
import { getMessage, createMessage, getPathToRoot } from "@/db/queries/messages";
import { touchChat, renameChat, getChat } from "@/db/queries/chats";
import { getMemoryContext, onNewExchange } from "@/lib/memory/memory-manager";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/constants";
import type { LLMMessage, FailoverEvent } from "@/types";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { userMessageId } = body;

  const userMessage = getMessage(userMessageId);
  if (!userMessage) {
    return new Response(JSON.stringify({ error: "Message not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (userMessage.role !== "user") {
    return new Response(JSON.stringify({ error: "Can only retry user messages" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  touchChat(userMessage.chatId);

  const settings = getSettings();

  const contextMessages = getPathToRoot(userMessage.id);

  // Build LLM messages with memory context
  const llmMessages: LLMMessage[] = [
    { role: "system", content: DEFAULT_SYSTEM_PROMPT },
  ];

  // Inject memory context if enabled
  try {
    const memoryContext = await getMemoryContext(userMessage.content);
    if (memoryContext) {
      llmMessages.push({ role: "system", content: memoryContext });
    }
  } catch (err) {
    console.error("[Retry] Memory context retrieval failed:", err);
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
        let actualProvider = settings.activeProvider;
        let actualModel = settings.activeModel;

        if (settings.failoverEnabled && settings.failoverChain.length > 0) {
          const executor = new FailoverExecutor({
            settings,
            onFailover: (evt: FailoverEvent) => {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify(evt)}\n\n`
                )
              );
            },
          });

          const gen = executor.stream({
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
              actualProvider = executor.actualProvider;
              actualModel = executor.actualModel;
              break;
            }
          }
        } else {
          const provider = await getProviderAsync(settings.activeProvider, settings);
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
          }
        }

        const assistantMessage = createMessage({
          chatId: userMessage.chatId,
          parentId: userMessage.id,
          role: "assistant",
          content: fullContent,
          provider: actualProvider,
          model: actualModel,
        });

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "done",
              message: assistantMessage,
              actualProvider,
              actualModel
            })}\n\n`
          )
        );

        // Extract facts for memory — await so it completes before the stream closes
        try {
          await onNewExchange(userMessage.chatId, userMessage.id, userMessage.content, fullContent);
        } catch (err) {
          console.error("[Retry] Memory extraction failed:", err);
        }

        // Auto-title chat if it's the first exchange
        const chat = getChat(userMessage.chatId);
        if (chat && chat.title === "New Chat") {
          const titleMessages: LLMMessage[] = [
            {
              role: "user",
              content: `Generate a short title (3-6 words) for the following conversation. Return only the title, no quotes or punctuation.\n\nUser: ${userMessage.content}\nAssistant: ${fullContent.slice(0, 500)}`,
            },
          ];

          let title = "";
          try {
            const titleProvider = await getPreviewProviderAsync(settings);
            const r = await titleProvider.complete({
              model: settings.previewModel,
              messages: titleMessages,
              temperature: 0.7,
              maxTokens: 500,
            });
            title = r.content.trim().replace(/^["']|["']$/g, "").slice(0, 50);
          } catch {
            try {
              const fallbackProvider = await getProviderAsync(settings.activeProvider, settings);
              const r = await fallbackProvider.complete({
                model: settings.activeModel,
                messages: titleMessages,
                temperature: 0.7,
                maxTokens: 500,
              });
              title = r.content.trim().replace(/^["']|["']$/g, "").slice(0, 50);
            } catch {
              // Title generation is best-effort
            }
          }

          if (title) {
            renameChat(userMessage.chatId, title);
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "title_updated", title })}\n\n`
              )
            );
          }
        }

        controller.close();
      } catch (error: any) {
        // Extract a readable error message from various error formats
        let errorMessage = "An unexpected error occurred";

        // Handle SDK errors (Anthropic, OpenAI) with status + nested error body
        if (error.status && error.error?.message) {
          errorMessage = `${error.error.message} (${error.status})`;
        } else if (error.status && error.message) {
          errorMessage = `${error.message}`;
        } else if (error.error?.message) {
          errorMessage = error.error.message;
        } else if (error.message) {
          errorMessage = error.message;
        } else if (typeof error === "string") {
          errorMessage = error;
        }

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", error: errorMessage })}\n\n`
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
