import { getDb } from "@/db";
import type { Settings, LLMProviderName } from "@/types";

// Admin settings are a singleton row — the app uses admin-configured keys for all users

export function getSettings(): Settings {
  // This is called synchronously in many places, but Supabase is async.
  // We cache the settings and provide an async initializer.
  if (cachedSettings) return cachedSettings;
  throw new Error("Settings not initialized. Call await initSettings() first.");
}

let cachedSettings: Settings | null = null;

export async function initSettings(): Promise<Settings> {
  if (cachedSettings) return cachedSettings;
  const db = getDb();
  const { data, error } = await db
    .from('admin_settings')
    .select('*')
    .eq('id', 1)
    .single();

  if (error || !data) {
    // Return sensible defaults if no row exists yet
    cachedSettings = getDefaultSettings();
    return cachedSettings;
  }

  cachedSettings = rowToSettings(data);
  return cachedSettings;
}

function getDefaultSettings(): Settings {
  return {
    activeProvider: 'anthropic' as LLMProviderName,
    activeModel: 'claude-sonnet-4-5-20250929',
    openaiApiKey: null,
    anthropicApiKey: null,
    geminiApiKey: null,
    ollamaBaseUrl: 'http://localhost:11434',
    memoryEnabled: true,
    embeddingMode: 'online' as any,
    embeddingProvider: 'openai' as LLMProviderName,
    embeddingModel: 'text-embedding-3-small',
    embeddingProviderOverride: false,
    localEmbeddingBackend: 'transformers' as any,
    localEmbeddingModel: 'nomic-ai/nomic-embed-text-v1.5',
    decayLambda: 0.0000001,
    similarityWeight: 0.7,
    temporalWeight: 0.3,
    previewProvider: 'anthropic' as LLMProviderName,
    previewModel: 'claude-haiku-4-5-20251001',
    previewProviderOverride: false,
    summarySentences: 2,
    openaiAuthMode: 'api_key' as any,
    anthropicAuthMode: 'api_key' as any,
    geminiAuthMode: 'api_key' as any,
    openaiOauthClientId: null,
    openaiOauthClientSecret: null,
    anthropicOauthClientId: null,
    anthropicOauthClientSecret: null,
    geminiOauthClientId: null,
    geminiOauthClientSecret: null,
    defaultOpenaiModel: 'gpt-5.2-pro',
    defaultAnthropicModel: 'claude-opus-4-6',
    defaultGeminiModel: 'gemini-3-pro-preview',
    defaultOllamaModel: 'qwen3-vl:30b',
    previewOpenaiModel: 'gpt-5-mini',
    previewAnthropicModel: 'claude-haiku-4-5-20251001',
    previewGeminiModel: 'gemini-3-flash-preview',
    previewOllamaModel: 'qwen3-vl:30b',
    failoverEnabled: false,
    failoverChain: [],
  };
}

function rowToSettings(row: any): Settings {
  return {
    activeProvider: row.active_provider as LLMProviderName,
    activeModel: row.active_model,
    openaiApiKey: row.openai_api_key || null,
    anthropicApiKey: row.anthropic_api_key || null,
    geminiApiKey: row.gemini_api_key || null,
    ollamaBaseUrl: row.ollama_base_url || 'http://localhost:11434',
    memoryEnabled: true,
    embeddingMode: (row.embedding_mode || 'online') as any,
    embeddingProvider: (row.embedding_provider || 'openai') as LLMProviderName,
    embeddingModel: row.embedding_model || 'text-embedding-3-small',
    embeddingProviderOverride: false,
    localEmbeddingBackend: (row.local_embedding_backend || 'transformers') as any,
    localEmbeddingModel: row.local_embedding_model || 'nomic-ai/nomic-embed-text-v1.5',
    decayLambda: 0.0000001,
    similarityWeight: 0.7,
    temporalWeight: 0.3,
    previewProvider: (row.preview_provider || 'anthropic') as LLMProviderName,
    previewModel: row.preview_model || 'claude-haiku-4-5-20251001',
    previewProviderOverride: false,
    summarySentences: row.summary_sentences ?? 2,
    openaiAuthMode: (row.openai_auth_mode || 'api_key') as any,
    anthropicAuthMode: (row.anthropic_auth_mode || 'api_key') as any,
    geminiAuthMode: (row.gemini_auth_mode || 'api_key') as any,
    openaiOauthClientId: null,
    openaiOauthClientSecret: null,
    anthropicOauthClientId: null,
    anthropicOauthClientSecret: null,
    geminiOauthClientId: null,
    geminiOauthClientSecret: null,
    defaultOpenaiModel: row.default_openai_model || 'gpt-5.2-pro',
    defaultAnthropicModel: row.default_anthropic_model || 'claude-opus-4-6',
    defaultGeminiModel: row.default_gemini_model || 'gemini-3-pro-preview',
    defaultOllamaModel: row.default_ollama_model || 'qwen3-vl:30b',
    previewOpenaiModel: row.preview_openai_model || 'gpt-5-mini',
    previewAnthropicModel: row.preview_anthropic_model || 'claude-haiku-4-5-20251001',
    previewGeminiModel: row.preview_gemini_model || 'gemini-3-flash-preview',
    previewOllamaModel: row.preview_ollama_model || 'qwen3-vl:30b',
    failoverEnabled: row.failover_enabled ?? false,
    failoverChain: row.failover_chain || [],
  };
}

export async function getSettingsAsync(): Promise<Settings> {
  // Always fetch fresh from Supabase to avoid stale cache in server-side API routes
  cachedSettings = null;
  return initSettings();
}

export async function updateSettings(settings: Partial<Settings>): Promise<void> {
  const db = getDb();
  const updates: Record<string, any> = { updated_at: new Date().toISOString() };

  if (settings.activeProvider !== undefined) updates.active_provider = settings.activeProvider;
  if (settings.activeModel !== undefined) updates.active_model = settings.activeModel;
  if (settings.openaiApiKey !== undefined) updates.openai_api_key = settings.openaiApiKey;
  if (settings.anthropicApiKey !== undefined) updates.anthropic_api_key = settings.anthropicApiKey;
  if (settings.geminiApiKey !== undefined) updates.gemini_api_key = settings.geminiApiKey;
  if (settings.ollamaBaseUrl !== undefined) updates.ollama_base_url = settings.ollamaBaseUrl;
  if (settings.embeddingProvider !== undefined) updates.embedding_provider = settings.embeddingProvider;
  if (settings.embeddingModel !== undefined) updates.embedding_model = settings.embeddingModel;
  if (settings.previewProvider !== undefined) updates.preview_provider = settings.previewProvider;
  if (settings.previewModel !== undefined) updates.preview_model = settings.previewModel;
  if (settings.embeddingMode !== undefined) updates.embedding_mode = settings.embeddingMode;
  if (settings.localEmbeddingBackend !== undefined) updates.local_embedding_backend = settings.localEmbeddingBackend;
  if (settings.localEmbeddingModel !== undefined) updates.local_embedding_model = settings.localEmbeddingModel;
  if (settings.summarySentences !== undefined) updates.summary_sentences = settings.summarySentences;
  if (settings.openaiAuthMode !== undefined) updates.openai_auth_mode = settings.openaiAuthMode;
  if (settings.anthropicAuthMode !== undefined) updates.anthropic_auth_mode = settings.anthropicAuthMode;
  if (settings.geminiAuthMode !== undefined) updates.gemini_auth_mode = settings.geminiAuthMode;
  if (settings.defaultOpenaiModel !== undefined) updates.default_openai_model = settings.defaultOpenaiModel;
  if (settings.defaultAnthropicModel !== undefined) updates.default_anthropic_model = settings.defaultAnthropicModel;
  if (settings.defaultGeminiModel !== undefined) updates.default_gemini_model = settings.defaultGeminiModel;
  if (settings.defaultOllamaModel !== undefined) updates.default_ollama_model = settings.defaultOllamaModel;
  if (settings.previewOpenaiModel !== undefined) updates.preview_openai_model = settings.previewOpenaiModel;
  if (settings.previewAnthropicModel !== undefined) updates.preview_anthropic_model = settings.previewAnthropicModel;
  if (settings.previewGeminiModel !== undefined) updates.preview_gemini_model = settings.previewGeminiModel;
  if (settings.previewOllamaModel !== undefined) updates.preview_ollama_model = settings.previewOllamaModel;
  if (settings.failoverEnabled !== undefined) updates.failover_enabled = settings.failoverEnabled;
  if (settings.failoverChain !== undefined) updates.failover_chain = settings.failoverChain;

  await db.from('admin_settings').update(updates).eq('id', 1);

  // Invalidate cache
  cachedSettings = null;
  await initSettings();
}

export function invalidateSettingsCache() {
  cachedSettings = null;
}
