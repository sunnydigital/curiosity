import { NextRequest } from "next/server";
import { createMessage, getPathToRoot } from "@/db/queries/messages";
import { touchChat } from "@/db/queries/chats";
import { getSettings } from "@/db/queries/settings";
import { getProviderAsync } from "@/lib/llm/provider-registry";
import { FailoverExecutor } from "@/lib/llm/failover";
import { BRANCH_PROMPTS, DEFAULT_SYSTEM_PROMPT } from "@/lib/constants";
import type { LLMMessage, BranchCreationRequest, FailoverEvent } from "@/types";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const { chatId } = await params;
  const body: BranchCreationRequest = await request.json();

  const promptPrefix =
    body.branchType === "custom" && body.customPrompt
      ? body.customPrompt + ": "
      : BRANCH_PROMPTS[body.branchType];

  const branchContent = promptPrefix + (body.selectedText || "");

  // Create the branch root message
  const branchRoot = createMessage({
    chatId,
    parentId: body.sourceMessageId,
    role: "user",
    content: branchContent,
    isBranchRoot: true,
    branchPrompt: promptPrefix,
    branchContext: body.selectedText,
    branchSourceMessageId: body.sourceMessageId,
    branchCharStart: body.charStart,
    branchCharEnd: body.charEnd,
  });

  touchChat(chatId);

  // Build context: path from root to source message + branch root
  const contextPath = getPathToRoot(branchRoot.id);
  const settings = getSettings();

  const llmMessages: LLMMessage[] = [
    { role: "system", content: DEFAULT_SYSTEM_PROMPT },
    ...contextPath.map((m) => ({
      role: m.role as LLMMessage["role"],
      content: m.content,
    })),
  ];

  const encoder = new TextEncoder();
  let fullContent = "";

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Immediately send the branch root so the client can navigate
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "branch_root", message: branchRoot })}\n\n`
          )
        );

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
          chatId,
          parentId: branchRoot.id,
          role: "assistant",
          content: fullContent,
          provider: actualProvider,
          model: actualModel,
        });

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "done", message: assistantMessage })}\n\n`
          )
        );

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
