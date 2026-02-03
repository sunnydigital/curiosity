-- Per-provider preview models (used for chat previews and summaries)
ALTER TABLE settings ADD COLUMN preview_openai_model TEXT NOT NULL DEFAULT 'gpt-5-mini';
ALTER TABLE settings ADD COLUMN preview_anthropic_model TEXT NOT NULL DEFAULT 'claude-haiku-4-5';
ALTER TABLE settings ADD COLUMN preview_gemini_model TEXT NOT NULL DEFAULT 'gemini-2.5-flash';
ALTER TABLE settings ADD COLUMN preview_ollama_model TEXT NOT NULL DEFAULT 'llama3.2';
