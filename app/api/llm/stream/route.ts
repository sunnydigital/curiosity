import { NextRequest, NextResponse } from "next/server";
import { getSettingsAsync } from "@/db/queries/settings";
import { getProviderAsync, getPreviewProviderAsync } from "@/lib/llm/provider-registry";
import { FailoverExecutor } from "@/lib/llm/failover";
import { createMessage, getPathToRoot } from "@/db/queries/messages";
import { touchChat, renameChat, getChat } from "@/db/queries/chats";
import { getMemoryContext } from "@/lib/memory/memory-manager";
import { getAuthContext } from "@/lib/auth/helpers";
import { checkRateLimit, incrementRateLimit } from "@/db/queries/rate-limits";
import { getUserApiKey } from "@/db/queries/user-api-keys";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/constants";
import type { LLMMessage, FailoverEvent, LLMProviderName } from "@/types";

export async function POST(request: NextRequest) {
  try {
  const body = await request.json();
  const { chatId, content, parentId, image, queryEmbedding } = body;

  // Auth & rate limit check
  const auth = await getAuthContext(request);
  let userHasOwnKey = false;

  // Check if logged-in user has their own API key for the active provider
  const baseSettings = await getSettingsAsync();
  const settings = { ...baseSettings };

  // Vercel serverless can't reach local Ollama — fall back to a cloud provider.
  // This applies to all users (anonymous and logged-in) when deployed to Vercel.
  if (settings.activeProvider === "ollama") {
    const cloudFallbacks: { provider: LLMProviderName; keyField: string; model: string }[] = [
      { provider: "anthropic", keyField: "anthropicApiKey", model: settings.defaultAnthropicModel || "claude-haiku-4-5-20251001" },
      { provider: "openai", keyField: "openaiApiKey", model: settings.defaultOpenaiModel || "gpt-4o-mini" },
      { provider: "gemini", keyField: "geminiApiKey", model: settings.defaultGeminiModel || "gemini-2.0-flash" },
    ];
    for (const fb of cloudFallbacks) {
      if ((settings as any)[fb.keyField]) {
        settings.activeProvider = fb.provider;
        settings.activeModel = fb.model;
        break;
      }
    }
  }

  if (auth.userId) {
    const userKey = await getUserApiKey(auth.userId, settings.activeProvider);
    if (userKey) {
      userHasOwnKey = true;
      // Override the API key in settings with user's own key
      const keyField = `${settings.activeProvider}ApiKey` as keyof typeof settings;
      (settings as any)[keyField] = userKey;
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

  const contextMessages = await getPathToRoot(userMessage.id);

  const llmMessages: LLMMessage[] = [
    { role: "system", content: DEFAULT_SYSTEM_PROMPT },
  ];

  try {
    const preComputedEmb = queryEmbedding?.embedding && queryEmbedding?.model
      ? { embedding: queryEmbedding.embedding as number[], model: queryEmbedding.model as string }
      : undefined;
    const memoryContext = await getMemoryContext(content, preComputedEmb, auth.userId);
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
          // Ollama runs locally — server can't reach it. Use a cloud provider for title generation.
          const cloudFallbacks: { provider: LLMProviderName; model: string }[] = [
            { provider: "anthropic", model: settings.previewModel || "claude-haiku-4-5-20251001" },
            { provider: "openai", model: "gpt-4o-mini" },
            { provider: "gemini", model: "gemini-2.0-flash" },
          ];

          for (const fb of cloudFallbacks) {
            if (title) break;
            try {
              const fbProvider = await getProviderAsync(fb.provider, settings);
              const r = await fbProvider.complete({
                model: fb.model,
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
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
