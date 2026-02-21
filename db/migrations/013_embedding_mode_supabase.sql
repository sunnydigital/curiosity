-- Add embedding mode columns to admin_settings (Supabase).
-- These were previously only in the local SQLite schema.

ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS embedding_mode TEXT NOT NULL DEFAULT 'online';
ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS local_embedding_backend TEXT NOT NULL DEFAULT 'transformers';
ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS local_embedding_model TEXT NOT NULL DEFAULT 'nomic-ai/nomic-embed-text-v1.5';
