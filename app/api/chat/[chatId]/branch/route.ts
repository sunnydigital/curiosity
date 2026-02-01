import { NextRequest, NextResponse } from "next/server";
import { createMessage, getPathToRoot } from "@/db/queries/messages";
import { touchChat } from "@/db/queries/chats";
import { getSettings } from "@/db/queries/settings";
import { getProvider } from "@/lib/llm/provider-registry";
import { BRANCH_PROMPTS, DEFAULT_SYSTEM_PROMPT } from "@/lib/constants";
import type { LLMMessage, BranchCreationRequest } from "@/types";

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
  const provider = getProvider(settings.activeProvider, settings);

  const llmMessages: LLMMessage[] = [
    { role: "system", content: DEFAULT_SYSTEM_PROMPT },
    ...contextPath.map((m) => ({
      role: m.role as LLMMessage["role"],
      content: m.content,
    })),
  ];

  try {
    const response = await provider.complete({
      model: settings.activeModel,
      messages: llmMessages,
    });

    const assistantMessage = createMessage({
      chatId,
      parentId: branchRoot.id,
      role: "assistant",
      content: response.content,
      provider: settings.activeProvider,
      model: settings.activeModel,
    });

    return NextResponse.json({ branchRoot, assistantMessage });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message, branchRoot },
      { status: 500 }
    );
  }
}
