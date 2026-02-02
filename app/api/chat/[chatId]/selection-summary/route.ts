import { NextRequest, NextResponse } from "next/server";
import { getSettings } from "@/db/queries/settings";
import { getPreviewProvider } from "@/lib/llm/provider-registry";
import { getSelectionSummaryPrompt } from "@/lib/constants";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  await params;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { selectedText } = body ?? {};

  // Use the DOM-selected text directly. Previously we tried to map DOM offsets
  // back to the raw markdown source, but rendered text (bold, LaTeX, etc.) has
  // different lengths than the raw markup, so the offsets were wrong.
  const textToSummarize = selectedText;

  if (!textToSummarize || typeof textToSummarize !== "string" || !textToSummarize.trim()) {
    return NextResponse.json({ error: "No text to summarize" }, { status: 400 });
  }

  const settings = getSettings();
  const provider = getPreviewProvider(settings);
  const sentences = settings.summarySentences ?? 2;
  const summaryPrompt = getSelectionSummaryPrompt(sentences);

  try {
    const response = await provider.complete({
      model: settings.previewModel,
      messages: [
        { role: "system", content: summaryPrompt },
        { role: "user", content: textToSummarize },
      ],
      maxTokens: Math.min(50 * sentences, 500),
    });

    return NextResponse.json({ summary: response.content.trim() });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
