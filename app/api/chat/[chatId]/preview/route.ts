import { NextRequest, NextResponse } from "next/server";
import { getMessage, getChildren, updatePreviewSummary } from "@/db/queries/messages";
import { getSettings } from "@/db/queries/settings";
import { getProvider } from "@/lib/llm/provider-registry";
import { PREVIEW_PROMPT } from "@/lib/constants";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  await params;
  const body = await request.json();
  const { messageId } = body;

  const message = getMessage(messageId);
  if (!message) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  // Return cached preview if available
  if (message.previewSummary) {
    return NextResponse.json({ summary: message.previewSummary });
  }

  // Get first child (assistant response) to include in preview context
  const children = getChildren(messageId);
  const firstResponse = children.find((c) => c.role === "assistant");

  const settings = getSettings();
  const provider = getProvider(settings.previewProvider, settings);

  try {
    const response = await provider.complete({
      model: settings.previewModel,
      messages: [
        { role: "system", content: PREVIEW_PROMPT },
        { role: "user", content: message.content },
        ...(firstResponse
          ? [
              {
                role: "assistant" as const,
                content: firstResponse.content,
              },
            ]
          : []),
      ],
      maxTokens: 150,
    });

    const summary = response.content.trim();
    updatePreviewSummary(messageId, summary);

    return NextResponse.json({ summary });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
