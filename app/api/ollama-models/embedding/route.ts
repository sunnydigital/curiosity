import { NextResponse } from "next/server";
import { getSettingsAsync } from "@/db/queries/settings";

/**
 * GET /api/ollama-models/embedding
 * Fetches embedding-capable models from the local Ollama server.
 * Returns model names that contain "embed" in their name/family,
 * plus a connected status flag.
 */
export async function GET() {
  try {
    const settings = await getSettingsAsync();
    const baseUrl = settings.ollamaBaseUrl.replace(/\/$/, "");
    const res = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return NextResponse.json({ models: [], connected: false });
    const data = await res.json();
    const allModels: any[] = data.models || [];

    // Filter for embedding models by name heuristic (common embedding model names)
    const embeddingKeywords = ["embed", "minilm", "bge-", "snowflake-arctic-embed", "e5-", "gte-", "granite-embedding", "paraphrase-multilingual"];
    const embeddingModels: string[] = allModels
      .map((m: any) => m.name as string)
      .filter((name: string) => {
        const lower = name.toLowerCase();
        return embeddingKeywords.some((kw) => lower.includes(kw));
      });

    return NextResponse.json({ models: embeddingModels, connected: true });
  } catch {
    return NextResponse.json({ models: [], connected: false });
  }
}
