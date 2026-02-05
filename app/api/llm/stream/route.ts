import { NextRequest } from "next/server";
import { getSettings } from "@/db/queries/settings";
import { getProviderAsync, getPreviewProviderAsync } from "@/lib/llm/provider-registry";
import { FailoverExecutor } from "@/lib/llm/failover";
import { createMessage, getPathToRoot } from "@/db/queries/messages";
import { touchChat, renameChat, getChat } from "@/db/queries/chats";
import { getMemoryContext, onNewExchange } from "@/lib/memory/memory-manager";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/constants";
import type { LLMMessage, FailoverEvent } from "@/types";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { chatId, content, parentId, image } = body;

  const userMessage = createMessage({
    chatId,
    parentId: parentId || null,
    role: "user",
    content,
  });

  touchChat(chatId);

  const settings = getSettings();

  console.log(`[Stream API] Settings loaded:`, {
    activeProvider: settings.activeProvider,
    activeModel: settings.activeModel,
    failoverEnabled: settings.failoverEnabled,
    failoverChain: settings.failoverChain,
    openaiAuthMode: settings.openaiAuthMode,
    anthropicAuthMode: settings.anthropicAuthMode,
    geminiAuthMode: settings.geminiAuthMode,
    hasOpenAIKey: !!settings.openaiApiKey,
    hasAnthropicKey: !!settings.anthropicApiKey,
    hasGeminiKey: !!settings.geminiApiKey,
    ollamaBaseUrl: settings.ollamaBaseUrl
  });

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

  // Attach image to the last user message if provided
  if (image && llmMessages.length > 0) {
    const lastMsg = llmMessages[llmMessages.length - 1];
    if (lastMsg.role === "user") {
      lastMsg.image = { base64: image.base64, mimeType: image.mimeType };
    }
  }

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

        // Auto-title chat early (before streaming) so the sidebar updates immediately
        const chat = getChat(chatId);
        if (chat && chat.title === "New Chat") {
          const titleMessages: LLMMessage[] = [
            {
              role: "user",
              content: `Generate a short title (3-6 words) for a conversation that starts with this message. Return only the title, no quotes or punctuation.\n\n${content}`,
            },
          ];

          let title = "";
          try {
            const titleProvider = await getPreviewProviderAsync(settings);
            const r = await titleProvider.complete({
              model: settings.previewModel,
              messages: titleMessages,
              temperature: 0.7,
              maxTokens: 30,
            });
            title = r.content.trim().replace(/^["']|["']$/g, "").slice(0, 50);
          } catch {
            try {
              const fallbackProvider = await getProviderAsync(settings.activeProvider, settings);
              const r = await fallbackProvider.complete({
                model: settings.activeModel,
                messages: titleMessages,
                temperature: 0.7,
                maxTokens: 30,
              });
              title = r.content.trim().replace(/^["']|["']$/g, "").slice(0, 50);
            } catch {
              // Title generation is best-effort
            }
          }

          if (title) {
            renameChat(chatId, title);
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "title_updated", title })}\n\n`
              )
            );
          }
        }

        let actualProvider = settings.activeProvider;
        let actualModel = settings.activeModel;
        let gen: AsyncGenerator<{ content: string; done: boolean }, void, unknown>;


        if (settings.failoverEnabled && settings.failoverChain.length > 0) {
          // Use failover executor
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

          gen = executor.stream({
            model: settings.activeModel,
            messages: llmMessages,
          });

          // We need to iterate and track the actual provider after completion
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
            }
          }
        } else {
          // Direct provider call (no failover)
          const provider = await getProviderAsync(settings.activeProvider, settings);
          gen = provider.stream({
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
          chatId,
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

        // Extract facts for memory (async, non-blocking)
        onNewExchange(chatId, userMessage.id, content, fullContent).catch(
          () => { }
        );

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
