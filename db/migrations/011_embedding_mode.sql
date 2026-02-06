-- Add embedding mode settings: local vs online, local backend type, local model
-- embedding_mode: 'local' or 'online' (default 'online' for backwards compatibility)
-- local_embedding_backend: 'transformers' | 'onnx' | 'tflite' | 'ollama'
-- local_embedding_model: model identifier for the selected backend

ALTER TABLE settings ADD COLUMN embedding_mode TEXT NOT NULL DEFAULT 'online';
ALTER TABLE settings ADD COLUMN local_embedding_backend TEXT NOT NULL DEFAULT 'transformers';
ALTER TABLE settings ADD COLUMN local_embedding_model TEXT NOT NULL DEFAULT 'nomic-ai/nomic-embed-text-v1.5';
