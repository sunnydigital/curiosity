-- Store OAuth client credentials per provider (encrypted)
-- These allow users to configure OAuth via the UI instead of env vars
ALTER TABLE settings ADD COLUMN openai_oauth_client_id TEXT DEFAULT NULL;
ALTER TABLE settings ADD COLUMN openai_oauth_client_secret TEXT DEFAULT NULL;
ALTER TABLE settings ADD COLUMN anthropic_oauth_client_id TEXT DEFAULT NULL;
ALTER TABLE settings ADD COLUMN anthropic_oauth_client_secret TEXT DEFAULT NULL;
ALTER TABLE settings ADD COLUMN gemini_oauth_client_id TEXT DEFAULT NULL;
ALTER TABLE settings ADD COLUMN gemini_oauth_client_secret TEXT DEFAULT NULL;
