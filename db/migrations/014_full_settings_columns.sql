-- Add all missing settings columns to admin_settings for full persistence

ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS summary_sentences INTEGER NOT NULL DEFAULT 2;
ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS openai_auth_mode TEXT NOT NULL DEFAULT 'api_key';
ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS anthropic_auth_mode TEXT NOT NULL DEFAULT 'api_key';
ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS gemini_auth_mode TEXT NOT NULL DEFAULT 'api_key';
ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS default_openai_model TEXT NOT NULL DEFAULT 'gpt-5.2-pro';
ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS default_anthropic_model TEXT NOT NULL DEFAULT 'claude-opus-4-6';
ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS default_gemini_model TEXT NOT NULL DEFAULT 'gemini-3-pro-preview';
ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS default_ollama_model TEXT NOT NULL DEFAULT 'qwen3-vl:30b';
ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS preview_openai_model TEXT NOT NULL DEFAULT 'gpt-5-mini';
ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS preview_anthropic_model TEXT NOT NULL DEFAULT 'claude-haiku-4-5-20251001';
ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS preview_gemini_model TEXT NOT NULL DEFAULT 'gemini-3-flash-preview';
ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS preview_ollama_model TEXT NOT NULL DEFAULT 'qwen3-vl:30b';
ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS failover_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS failover_chain JSONB NOT NULL DEFAULT '[]'::jsonb;
