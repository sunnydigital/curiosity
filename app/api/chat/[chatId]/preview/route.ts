import { NextRequest, NextResponse } from "next/server";
import { getMessage, getChildren, updatePreviewSummary } from "@/db/queries/messages";
import { getSettingsAsync } from "@/db/queries/settings";
import { getProviderAsync } from "@/lib/llm/provider-registry";
import { PREVIEW_PROMPT } from "@/lib/constants";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  await params;
  const body = await request.json();
  const { messageId } = body;

  const message = await getMessage(messageId);
  if (!message) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  if (message.previewSummary) {
    return NextResponse.json({ summary: message.previewSummary });
  }

  const children = await getChildren(messageId);
  const firstResponse = children.find((c) => c.role === "assistant");

  const settings = await getSettingsAsync();
  const provider = await getProviderAsync(settings.previewProvider, settings);

  try {
    const response = await provider.complete({
      model: settings.previewModel,
      messages: [
        { role: "system", content: PREVIEW_PROMPT },
        { role: "user", content: message.content },
        ...(firstResponse
          ? [{ role: "assistant" as const, content: firstResponse.content }]
          : []),
      ],
      maxTokens: 150,
    });

    const summary = response.content.trim();
    await updatePreviewSummary(messageId, summary);

    return NextResponse.json({ summary });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
