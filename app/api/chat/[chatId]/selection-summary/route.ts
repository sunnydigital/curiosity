import { NextRequest, NextResponse } from "next/server";
import { getMessage } from "@/db/queries/messages";
import { getSettings } from "@/db/queries/settings";
import { getPreviewProvider } from "@/lib/llm/provider-registry";
import { SELECTION_SUMMARY_PROMPT } from "@/lib/constants";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  await params;
  const { messageId, charStart, charEnd, selectedText } = await request.json();

  // Try to extract raw source text from the stored message using offsets.
  // This preserves LaTeX and other markup that gets lost in DOM selection.
  let textToSummarize = selectedText;

  if (messageId) {
    const message = getMessage(messageId);
    if (message && typeof charStart === "number" && typeof charEnd === "number") {
      const raw = message.content.slice(charStart, charEnd);
      if (raw.trim()) {
        textToSummarize = raw;
      }
    }
  }

  if (!textToSummarize || typeof textToSummarize !== "string") {
    return NextResponse.json({ error: "No text to summarize" }, { status: 400 });
  }

  const settings = getSettings();
  const provider = getPreviewProvider(settings);

  try {
    const response = await provider.complete({
      model: settings.previewModel,
      messages: [
        { role: "system", content: SELECTION_SUMMARY_PROMPT },
        { role: "user", content: textToSummarize },
      ],
      maxTokens: 100,
    });

    return NextResponse.json({ summary: response.content.trim() });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
