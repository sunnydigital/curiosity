-- Per-provider default models used when switching via the TopBar icons
ALTER TABLE settings ADD COLUMN default_openai_model TEXT NOT NULL DEFAULT 'gpt-5-mini';
ALTER TABLE settings ADD COLUMN default_anthropic_model TEXT NOT NULL DEFAULT 'claude-sonnet-4-5-20250929';
ALTER TABLE settings ADD COLUMN default_gemini_model TEXT NOT NULL DEFAULT 'gemini-2.5-flash';
