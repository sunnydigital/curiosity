import { NextRequest, NextResponse } from "next/server";
import { getSettings } from "@/db/queries/settings";
import { getPreviewProvider } from "@/lib/llm/provider-registry";
import { SELECTION_SUMMARY_PROMPT } from "@/lib/constants";

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
