/**
 * Local Embedding Provider
 *
 * Uses the local Ollama server for on-device embedding generation.
 */

import type { EmbeddingResponse } from "@/types";

/**
 * Generate embeddings using the local Ollama server
 */
export async function generateLocalEmbedding(
  text: string,
  _backend: string,
  model: string,
  ollamaBaseUrl?: string
): Promise<EmbeddingResponse> {
  const baseUrl = ollamaBaseUrl || "http://localhost:11434";
  console.log(`[LocalEmbedding] Generating embedding with Ollama, model: ${model}`);

  try {
    const response = await fetch(`${baseUrl}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        input: text,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const embedding = data.embeddings?.[0] || data.embedding || [];

    if (!embedding || embedding.length === 0) {
      throw new Error(`Ollama returned empty embedding. Make sure model '${model}' is pulled.`);
    }

    return {
      embedding,
      dimensions: embedding.length,
    };
  } catch (error: any) {
    console.error("[LocalEmbedding] Ollama error:", error);

    if (error.cause?.code === "ECONNREFUSED") {
      throw new Error(
        `Cannot connect to Ollama at ${baseUrl}. ` +
        `Make sure Ollama is running (ollama serve) and the embedding model is pulled (ollama pull ${model}).`
      );
    }

    throw new Error(`Ollama embedding failed: ${error.message}`);
  }
}

/**
 * Check if the local Ollama embedding backend is available
 */
export async function checkLocalBackendAvailability(
  _backend: string,
  ollamaBaseUrl?: string
): Promise<{ available: boolean; message: string }> {
  try {
    const url = ollamaBaseUrl || "http://localhost:11434";
    const response = await fetch(`${url}/api/tags`, {
      method: "GET",
      signal: AbortSignal.timeout(3000),
    });
    if (response.ok) {
      return { available: true, message: "Ollama is running" };
    }
    return { available: false, message: `Ollama returned ${response.status}` };
  } catch {
    return {
      available: false,
      message: "Ollama is not running. Start with: ollama serve"
    };
  }
}
