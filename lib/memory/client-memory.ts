import { completeOllama, generateOllamaEmbedding } from "@/lib/llm/ollama-client";
import { FACT_EXTRACTION_PROMPT } from "@/lib/constants";

export async function createMemoriesClientSide(params: {
  baseUrl: string;
  chatModel: string;
  embeddingModel: string;
  chatId: string;
  messageId: string;
  userContent: string;
  assistantContent: string;
}): Promise<void> {
  const { baseUrl, chatModel, embeddingModel, chatId, messageId, userContent, assistantContent } = params;

  // Step 1: Extract facts using Ollama completion
  const conversationText = `User: ${userContent}\n\nAssistant: ${assistantContent}`;
  const response = await completeOllama({
    baseUrl,
    model: chatModel,
    messages: [
      { role: "system", content: FACT_EXTRACTION_PROMPT },
      { role: "user", content: conversationText },
    ],
    temperature: 0.3,
  });

  // Parse facts from response
  let content = response.trim();
  content = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const match = content.match(/\[[\s\S]*\]/);
  if (!match) return;

  let facts: string[];
  try {
    facts = JSON.parse(match[0]);
    if (!Array.isArray(facts)) return;
    facts = facts.filter((f): f is string => typeof f === "string" && f.trim().length > 0);
  } catch {
    return;
  }

  if (facts.length === 0) return;

  // Step 2: Generate embeddings for each fact
  const factsWithEmbeddings = [];
  for (const fact of facts) {
    try {
      const embedding = await generateOllamaEmbedding({
        baseUrl,
        model: embeddingModel,
        text: fact,
      });
      factsWithEmbeddings.push({
        content: fact,
        embedding,
        embeddingModel: embeddingModel,
      });
    } catch (err) {
      console.warn("[ClientMemory] Embedding failed for fact:", err);
    }
  }

  if (factsWithEmbeddings.length === 0) return;

  // Step 3: Send to server to store
  await fetch("/api/memories/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      facts: factsWithEmbeddings,
      chatId,
      messageId,
    }),
  });
}
