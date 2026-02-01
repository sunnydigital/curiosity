import { getDb } from "@/db";
import { encrypt, decrypt } from "@/lib/crypto";
import type { Settings, LLMProviderName } from "@/types";

interface SettingsRow {
  active_provider: string;
  active_model: string;
  openai_api_key: string | null;
  anthropic_api_key: string | null;
  gemini_api_key: string | null;
  ollama_base_url: string;
  memory_enabled: number;
  embedding_provider: string;
  embedding_model: string;
  decay_lambda: number;
  similarity_weight: number;
  temporal_weight: number;
  preview_provider: string;
  preview_model: string;
}

export function getSettings(): Settings {
  const db = getDb();
  const row = db.prepare("SELECT * FROM settings WHERE id = 1").get() as SettingsRow;

  return {
    activeProvider: row.active_provider as LLMProviderName,
    activeModel: row.active_model,
    openaiApiKey: row.openai_api_key ? decrypt(row.openai_api_key) : null,
    anthropicApiKey: row.anthropic_api_key ? decrypt(row.anthropic_api_key) : null,
    geminiApiKey: row.gemini_api_key ? decrypt(row.gemini_api_key) : null,
    ollamaBaseUrl: row.ollama_base_url,
    memoryEnabled: row.memory_enabled === 1,
    embeddingProvider: row.embedding_provider as LLMProviderName,
    embeddingModel: row.embedding_model,
    decayLambda: row.decay_lambda,
    similarityWeight: row.similarity_weight,
    temporalWeight: row.temporal_weight,
    previewProvider: row.preview_provider as LLMProviderName,
    previewModel: row.preview_model,
  };
}

export function updateSettings(settings: Partial<Settings>): void {
  const db = getDb();
  const updates: string[] = [];
  const values: any[] = [];

  if (settings.activeProvider !== undefined) {
    updates.push("active_provider = ?");
    values.push(settings.activeProvider);
  }
  if (settings.activeModel !== undefined) {
    updates.push("active_model = ?");
    values.push(settings.activeModel);
  }
  if (settings.openaiApiKey !== undefined) {
    updates.push("openai_api_key = ?");
    values.push(settings.openaiApiKey ? encrypt(settings.openaiApiKey) : null);
  }
  if (settings.anthropicApiKey !== undefined) {
    updates.push("anthropic_api_key = ?");
    values.push(settings.anthropicApiKey ? encrypt(settings.anthropicApiKey) : null);
  }
  if (settings.geminiApiKey !== undefined) {
    updates.push("gemini_api_key = ?");
    values.push(settings.geminiApiKey ? encrypt(settings.geminiApiKey) : null);
  }
  if (settings.ollamaBaseUrl !== undefined) {
    updates.push("ollama_base_url = ?");
    values.push(settings.ollamaBaseUrl);
  }
  if (settings.memoryEnabled !== undefined) {
    updates.push("memory_enabled = ?");
    values.push(settings.memoryEnabled ? 1 : 0);
  }
  if (settings.embeddingProvider !== undefined) {
    updates.push("embedding_provider = ?");
    values.push(settings.embeddingProvider);
  }
  if (settings.embeddingModel !== undefined) {
    updates.push("embedding_model = ?");
    values.push(settings.embeddingModel);
  }
  if (settings.decayLambda !== undefined) {
    updates.push("decay_lambda = ?");
    values.push(settings.decayLambda);
  }
  if (settings.similarityWeight !== undefined) {
    updates.push("similarity_weight = ?");
    values.push(settings.similarityWeight);
  }
  if (settings.temporalWeight !== undefined) {
    updates.push("temporal_weight = ?");
    values.push(settings.temporalWeight);
  }
  if (settings.previewProvider !== undefined) {
    updates.push("preview_provider = ?");
    values.push(settings.previewProvider);
  }
  if (settings.previewModel !== undefined) {
    updates.push("preview_model = ?");
    values.push(settings.previewModel);
  }

  if (updates.length === 0) return;

  updates.push("updated_at = datetime('now')");
  values.push(1);

  db.prepare(`UPDATE settings SET ${updates.join(", ")} WHERE id = ?`).run(
    ...values
  );
}
