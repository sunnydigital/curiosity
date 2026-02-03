-- When 0 (default), embedding/preview providers auto-follow the active provider.
-- When 1, the stored embedding_provider / preview_provider values are used instead.
ALTER TABLE settings ADD COLUMN embedding_provider_override INTEGER NOT NULL DEFAULT 0;
ALTER TABLE settings ADD COLUMN preview_provider_override INTEGER NOT NULL DEFAULT 0;
