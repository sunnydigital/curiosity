import { NextRequest, NextResponse } from "next/server";
import { getChat, renameChat } from "@/db/queries/chats";
import { getSettingsAsync } from "@/db/queries/settings";
import { getProviderAsync } from "@/lib/llm/provider-registry";
import type { LLMProviderName } from "@/types";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const { chatId } = await params;
  const { userContent, assistantContent } = await request.json();

  const chat = await getChat(chatId);
  if (!chat || chat.title !== "New Chat") {
    return NextResponse.json({ titleUpdated: false });
  }

  const settings = await getSettingsAsync();
  const titleMessages = [
    {
      role: "user" as const,
      content: `Generate a short title (3-6 words) for the following conversation. Return ONLY the title text, nothing else.\n\nUser: ${userContent}\nAssistant: ${assistantContent}`,
    },
  ];

  // Try cloud providers for title generation (server can't reach local Ollama)
  const cloudFallbacks: { provider: LLMProviderName; model: string }[] = [
    { provider: "anthropic", model: settings.previewModel || "claude-haiku-4-5-20251001" },
    { provider: "openai", model: "gpt-4o-mini" },
    { provider: "gemini", model: "gemini-2.0-flash" },
  ];

  for (const fb of cloudFallbacks) {
    try {
      const provider = await getProviderAsync(fb.provider, settings);
      const r = await provider.complete({
        model: fb.model,
        messages: titleMessages,
        temperature: 0.7,
        maxTokens: 30,
      });
      const title = r.content.trim().replace(/^["']|["']$/g, "").slice(0, 50);
      if (title) {
        await renameChat(chatId, title);
        return NextResponse.json({ titleUpdated: true, title });
      }
    } catch {}
  }

  return NextResponse.json({ titleUpdated: false });
}
