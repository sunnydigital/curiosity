import { getSettings } from "@/db/queries/settings";
import { getEmbeddingProvider } from "./provider-registry";

export async function generateEmbedding(text: string): Promise<number[]> {
  const settings = getSettings();
  const provider = getEmbeddingProvider(settings);
  const response = await provider.embed({
    text,
    model: settings.embeddingModel,
  });
  return response.embedding;
}
