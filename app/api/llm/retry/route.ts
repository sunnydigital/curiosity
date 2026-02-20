import { NextRequest } from "next/server";
import { getSettingsAsync } from "@/db/queries/settings";
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

  const userMessage = await getMessage(userMessageId);
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

  await touchChat(userMessage.chatId);
  const settings = await getSettingsAsync();
  const contextMessages = await getPathToRoot(userMessage.id);

  const llmMessages: LLMMessage[] = [
    { role: "system", content: DEFAULT_SYSTEM_PROMPT },
  ];

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
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(evt)}\n\n`));
            },
          });

          const gen = executor.stream({ model: settings.activeModel, messages: llmMessages });
          for await (const chunk of gen) {
            if (chunk.content) {
              fullContent += chunk.content;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "chunk", content: chunk.content })}\n\n`));
            }
            if (chunk.done) {
              actualProvider = executor.actualProvider;
              actualModel = executor.actualModel;
              break;
            }
          }
        } else {
          const provider = await getProviderAsync(settings.activeProvider, settings);
          const gen = provider.stream({ model: settings.activeModel, messages: llmMessages });
          for await (const chunk of gen) {
            if (chunk.content) {
              fullContent += chunk.content;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "chunk", content: chunk.content })}\n\n`));
            }
          }
        }

        const assistantMessage = await createMessage({
          chatId: userMessage.chatId,
          parentId: userMessage.id,
          role: "assistant",
          content: fullContent,
          provider: actualProvider,
          model: actualModel,
        });

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done", message: assistantMessage, actualProvider, actualModel })}\n\n`));

        try {
          await onNewExchange(userMessage.chatId, userMessage.id, userMessage.content, fullContent);
        } catch (err) {
          console.error("[Retry] Memory extraction failed:", err);
        }

        const chat = await getChat(userMessage.chatId);
        if (chat && chat.title === "New Chat") {
          let title = "";
          try {
            const titleProvider = await getPreviewProviderAsync(settings);
            const r = await titleProvider.complete({
              model: settings.previewModel,
              messages: [{ role: "user", content: `Generate a short title (3-6 words) for the following conversation. Return only the title.\n\nUser: ${userMessage.content}\nAssistant: ${fullContent.slice(0, 500)}` }],
              temperature: 0.7,
              maxTokens: 500,
            });
            title = r.content.trim().replace(/^["']|["']$/g, "").slice(0, 50);
          } catch {
            try {
              const fallbackProvider = await getProviderAsync(settings.activeProvider, settings);
              const r = await fallbackProvider.complete({
                model: settings.activeModel,
                messages: [{ role: "user", content: `Generate a short title (3-6 words). Return only the title.\n\nUser: ${userMessage.content}` }],
                temperature: 0.7, maxTokens: 30,
              });
              title = r.content.trim().replace(/^["']|["']$/g, "").slice(0, 50);
            } catch {}
          }
          if (title) {
            await renameChat(userMessage.chatId, title);
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "title_updated", title })}\n\n`));
          }
        }

        controller.close();
      } catch (error: any) {
        let errorMessage = error.error?.message || error.message || "An unexpected error occurred";
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", error: errorMessage })}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
