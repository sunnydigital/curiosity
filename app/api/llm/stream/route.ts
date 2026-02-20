import { NextRequest } from "next/server";
import { getSettingsAsync } from "@/db/queries/settings";
import { getProviderAsync, getPreviewProviderAsync } from "@/lib/llm/provider-registry";
import { FailoverExecutor } from "@/lib/llm/failover";
import { createMessage, getPathToRoot } from "@/db/queries/messages";
import { touchChat, renameChat, getChat } from "@/db/queries/chats";
import { getMemoryContext, onNewExchange } from "@/lib/memory/memory-manager";
import { getAuthContext } from "@/lib/auth/helpers";
import { checkRateLimit, incrementRateLimit } from "@/db/queries/rate-limits";
import { getUserApiKey } from "@/db/queries/user-api-keys";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/constants";
import type { LLMMessage, FailoverEvent } from "@/types";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { chatId, content, parentId, image } = body;

  // Auth & rate limit check
  const auth = await getAuthContext(request);
  let userHasOwnKey = false;

  // Check if logged-in user has their own API key for the active provider
  const settings = await getSettingsAsync();
  if (auth.userId) {
    const userKey = await getUserApiKey(auth.userId, settings.activeProvider);
    if (userKey) {
      userHasOwnKey = true;
    }
  }

  // Rate limit only applies to anonymous users (not logged-in, not using own key)
  if (!auth.userId) {
    const ip = auth.anonIp || '127.0.0.1';
    const rateLimit = await checkRateLimit(ip);
    if (rateLimit.isLimited) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "error",
                error: "You've reached the free message limit (20 messages). Please sign up to continue chatting!",
                rateLimited: true,
              })}\n\n`
            )
          );
          controller.close();
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
    await incrementRateLimit(ip);
  }

  const userMessage = await createMessage({
    chatId,
    parentId: parentId || null,
    role: "user",
    content,
  });

  await touchChat(chatId);

  // If user has their own API key, override the settings for provider creation
  if (userHasOwnKey && auth.userId) {
    const userKey = await getUserApiKey(auth.userId, settings.activeProvider);
    if (userKey) {
      const keyField = `${settings.activeProvider}ApiKey` as keyof typeof settings;
      (settings as any)[keyField] = userKey;
    }
  }

  const contextMessages = await getPathToRoot(userMessage.id);

  const llmMessages: LLMMessage[] = [
    { role: "system", content: DEFAULT_SYSTEM_PROMPT },
  ];

  try {
    const memoryContext = await getMemoryContext(content);
    if (memoryContext) {
      llmMessages.push({ role: "system", content: memoryContext });
    }
  } catch (err) {
    console.error("[Stream] Memory context retrieval failed:", err);
  }

  llmMessages.push(
    ...contextMessages.map((m) => ({
      role: m.role as LLMMessage["role"],
      content: m.content,
    }))
  );

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

        const chat = await getChat(chatId);
        const needsAutoTitle = chat && chat.title === "New Chat";

        if (needsAutoTitle && settings.activeProvider !== "ollama") {
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
            } catch {}
          }

          if (title) {
            await renameChat(chatId, title);
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "title_updated", title })}\n\n`
              )
            );
          }
        }

        let actualProvider = settings.activeProvider;
        let actualModel = settings.activeModel;

        if (settings.failoverEnabled && settings.failoverChain.length > 0) {
          const executor = new FailoverExecutor({
            settings,
            onFailover: (evt: FailoverEvent) => {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(evt)}\n\n`)
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

        const assistantMessage = await createMessage({
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
              actualModel,
            })}\n\n`
          )
        );

        if (needsAutoTitle && settings.activeProvider === "ollama") {
          const titleMessages: LLMMessage[] = [
            {
              role: "user",
              content: `Generate a short title (3-6 words) for the following conversation. Return ONLY the title text, nothing else.\n\nUser: ${content}\nAssistant: ${fullContent.slice(0, 500)}`,
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
            } catch {}
          }

          if (title) {
            await renameChat(chatId, title);
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "title_updated", title })}\n\n`
              )
            );
          }
        }

        try {
          await onNewExchange(chatId, userMessage.id, content, fullContent);
        } catch (err) {
          console.error("[Stream] Memory extraction failed:", err);
        }

        controller.close();
      } catch (error: any) {
        let errorMessage = "An unexpected error occurred";
        if (error.status && error.error?.message) {
          errorMessage = `${error.error.message} (${error.status})`;
        } else if (error.message) {
          errorMessage = error.message;
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
