-- Per-provider default model for Ollama used when switching via the TopBar icons
ALTER TABLE settings ADD COLUMN default_ollama_model TEXT NOT NULL DEFAULT 'llama3.2';
