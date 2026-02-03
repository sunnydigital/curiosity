import { getDb } from "@/db";
import { encrypt, decrypt } from "@/lib/crypto";
import type { Settings, LLMProviderName, AuthMode } from "@/types";

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
  summary_sentences: number;
  openai_auth_mode: string;
  anthropic_auth_mode: string;
  gemini_auth_mode: string;
  failover_enabled: number;
  failover_chain: string;
  openai_oauth_client_id: string | null;
  openai_oauth_client_secret: string | null;
  anthropic_oauth_client_id: string | null;
  anthropic_oauth_client_secret: string | null;
  gemini_oauth_client_id: string | null;
  gemini_oauth_client_secret: string | null;
  default_openai_model: string;
  default_anthropic_model: string;
  default_gemini_model: string;
  default_ollama_model: string;
  embedding_provider_override: number;
  preview_provider_override: number;
  preview_openai_model: string;
  preview_anthropic_model: string;
  preview_gemini_model: string;
  preview_ollama_model: string;
}

export function getSettings(): Settings {
  const db = getDb();
  const row = db.prepare("SELECT * FROM settings WHERE id = 1").get() as SettingsRow;

  let failoverChain: LLMProviderName[] = [];
  try {
    failoverChain = JSON.parse(row.failover_chain || "[]");
  } catch {
    failoverChain = [];
  }

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
    embeddingProviderOverride: row.embedding_provider_override === 1,
    decayLambda: row.decay_lambda,
    similarityWeight: row.similarity_weight,
    temporalWeight: row.temporal_weight,
    previewProvider: row.preview_provider as LLMProviderName,
    previewModel: row.preview_model,
    previewProviderOverride: row.preview_provider_override === 1,
    summarySentences: row.summary_sentences,
    openaiAuthMode: (row.openai_auth_mode || "api_key") as AuthMode,
    anthropicAuthMode: (row.anthropic_auth_mode || "api_key") as AuthMode,
    geminiAuthMode: (row.gemini_auth_mode || "api_key") as AuthMode,
    openaiOauthClientId: row.openai_oauth_client_id ? decrypt(row.openai_oauth_client_id) : null,
    openaiOauthClientSecret: row.openai_oauth_client_secret ? decrypt(row.openai_oauth_client_secret) : null,
    anthropicOauthClientId: row.anthropic_oauth_client_id ? decrypt(row.anthropic_oauth_client_id) : null,
    anthropicOauthClientSecret: row.anthropic_oauth_client_secret ? decrypt(row.anthropic_oauth_client_secret) : null,
    geminiOauthClientId: row.gemini_oauth_client_id ? decrypt(row.gemini_oauth_client_id) : null,
    geminiOauthClientSecret: row.gemini_oauth_client_secret ? decrypt(row.gemini_oauth_client_secret) : null,
    defaultOpenaiModel: row.default_openai_model || "gpt-5-mini",
    defaultAnthropicModel: row.default_anthropic_model || "claude-sonnet-4-5-20250929",
    defaultGeminiModel: row.default_gemini_model || "gemini-2.5-flash",
    defaultOllamaModel: row.default_ollama_model || "llama3.2",
    previewOpenaiModel: row.preview_openai_model || "gpt-5-mini",
    previewAnthropicModel: row.preview_anthropic_model || "claude-haiku-4-5",
    previewGeminiModel: row.preview_gemini_model || "gemini-2.5-flash",
    previewOllamaModel: row.preview_ollama_model || "llama3.2",
    failoverEnabled: row.failover_enabled === 1,
    failoverChain,
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
  if (settings.summarySentences !== undefined) {
    updates.push("summary_sentences = ?");
    values.push(settings.summarySentences);
  }
  if (settings.openaiAuthMode !== undefined) {
    updates.push("openai_auth_mode = ?");
    values.push(settings.openaiAuthMode);
  }
  if (settings.anthropicAuthMode !== undefined) {
    updates.push("anthropic_auth_mode = ?");
    values.push(settings.anthropicAuthMode);
  }
  if (settings.geminiAuthMode !== undefined) {
    updates.push("gemini_auth_mode = ?");
    values.push(settings.geminiAuthMode);
  }
  if (settings.openaiOauthClientId !== undefined) {
    updates.push("openai_oauth_client_id = ?");
    values.push(settings.openaiOauthClientId ? encrypt(settings.openaiOauthClientId) : null);
  }
  if (settings.openaiOauthClientSecret !== undefined) {
    updates.push("openai_oauth_client_secret = ?");
    values.push(settings.openaiOauthClientSecret ? encrypt(settings.openaiOauthClientSecret) : null);
  }
  if (settings.anthropicOauthClientId !== undefined) {
    updates.push("anthropic_oauth_client_id = ?");
    values.push(settings.anthropicOauthClientId ? encrypt(settings.anthropicOauthClientId) : null);
  }
  if (settings.anthropicOauthClientSecret !== undefined) {
    updates.push("anthropic_oauth_client_secret = ?");
    values.push(settings.anthropicOauthClientSecret ? encrypt(settings.anthropicOauthClientSecret) : null);
  }
  if (settings.geminiOauthClientId !== undefined) {
    updates.push("gemini_oauth_client_id = ?");
    values.push(settings.geminiOauthClientId ? encrypt(settings.geminiOauthClientId) : null);
  }
  if (settings.geminiOauthClientSecret !== undefined) {
    updates.push("gemini_oauth_client_secret = ?");
    values.push(settings.geminiOauthClientSecret ? encrypt(settings.geminiOauthClientSecret) : null);
  }
  if (settings.defaultOpenaiModel !== undefined) {
    updates.push("default_openai_model = ?");
    values.push(settings.defaultOpenaiModel);
  }
  if (settings.defaultAnthropicModel !== undefined) {
    updates.push("default_anthropic_model = ?");
    values.push(settings.defaultAnthropicModel);
  }
  if (settings.defaultGeminiModel !== undefined) {
    updates.push("default_gemini_model = ?");
    values.push(settings.defaultGeminiModel);
  }
  if (settings.defaultOllamaModel !== undefined) {
    updates.push("default_ollama_model = ?");
    values.push(settings.defaultOllamaModel);
  }
  if (settings.previewOpenaiModel !== undefined) {
    updates.push("preview_openai_model = ?");
    values.push(settings.previewOpenaiModel);
  }
  if (settings.previewAnthropicModel !== undefined) {
    updates.push("preview_anthropic_model = ?");
    values.push(settings.previewAnthropicModel);
  }
  if (settings.previewGeminiModel !== undefined) {
    updates.push("preview_gemini_model = ?");
    values.push(settings.previewGeminiModel);
  }
  if (settings.previewOllamaModel !== undefined) {
    updates.push("preview_ollama_model = ?");
    values.push(settings.previewOllamaModel);
  }
  if (settings.embeddingProviderOverride !== undefined) {
    updates.push("embedding_provider_override = ?");
    values.push(settings.embeddingProviderOverride ? 1 : 0);
  }
  if (settings.previewProviderOverride !== undefined) {
    updates.push("preview_provider_override = ?");
    values.push(settings.previewProviderOverride ? 1 : 0);
  }
  if (settings.failoverEnabled !== undefined) {
    updates.push("failover_enabled = ?");
    values.push(settings.failoverEnabled ? 1 : 0);
  }
  if (settings.failoverChain !== undefined) {
    updates.push("failover_chain = ?");
    values.push(JSON.stringify(settings.failoverChain));
  }

  if (updates.length === 0) return;

  updates.push("updated_at = datetime('now')");
  values.push(1);

  db.prepare(`UPDATE settings SET ${updates.join(", ")} WHERE id = ?`).run(
    ...values
  );
}
