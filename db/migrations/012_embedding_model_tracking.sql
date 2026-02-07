-- Track which embedding model was used for each memory and KB entry.
-- Existing rows get NULL (unknown/legacy model).
-- This allows detecting incompatible embeddings when the provider changes.

ALTER TABLE memories ADD COLUMN embedding_model TEXT DEFAULT NULL;
ALTER TABLE knowledge_base_entries ADD COLUMN embedding_model TEXT DEFAULT NULL;
