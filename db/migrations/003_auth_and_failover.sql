-- Per-provider auth mode: 'api_key' or 'oauth'
ALTER TABLE settings ADD COLUMN openai_auth_mode TEXT NOT NULL DEFAULT 'api_key';
ALTER TABLE settings ADD COLUMN anthropic_auth_mode TEXT NOT NULL DEFAULT 'api_key';
ALTER TABLE settings ADD COLUMN gemini_auth_mode TEXT NOT NULL DEFAULT 'api_key';

-- Failover configuration
ALTER TABLE settings ADD COLUMN failover_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE settings ADD COLUMN failover_chain TEXT NOT NULL DEFAULT '[]';

-- OAuth tokens table
CREATE TABLE IF NOT EXISTS oauth_tokens (
    provider            TEXT PRIMARY KEY,
    access_token        TEXT NOT NULL,
    refresh_token       TEXT,
    token_type          TEXT NOT NULL DEFAULT 'Bearer',
    expires_at          TEXT,
    scope               TEXT,
    subscription_tier   TEXT DEFAULT 'unknown',
    subscription_metadata TEXT DEFAULT '{}',
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
