PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS settings (
    id              INTEGER PRIMARY KEY CHECK (id = 1),
    active_provider TEXT    NOT NULL DEFAULT 'openai',
    active_model    TEXT    NOT NULL DEFAULT 'gpt-4o',
    openai_api_key      TEXT DEFAULT NULL,
    anthropic_api_key   TEXT DEFAULT NULL,
    gemini_api_key      TEXT DEFAULT NULL,
    ollama_base_url     TEXT DEFAULT 'http://localhost:11434',
    memory_enabled  INTEGER NOT NULL DEFAULT 1,
    embedding_provider TEXT NOT NULL DEFAULT 'openai',
    embedding_model    TEXT NOT NULL DEFAULT 'text-embedding-3-small',
    decay_lambda       REAL NOT NULL DEFAULT 0.0000001,
    similarity_weight  REAL NOT NULL DEFAULT 0.7,
    temporal_weight    REAL NOT NULL DEFAULT 0.3,
    preview_provider   TEXT NOT NULL DEFAULT 'openai',
    preview_model      TEXT NOT NULL DEFAULT 'gpt-4o-mini',
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO settings (id) VALUES (1);

CREATE TABLE IF NOT EXISTS chats (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL DEFAULT 'New Chat',
    starred     INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_chats_updated ON chats(updated_at DESC);

CREATE TABLE IF NOT EXISTS messages (
    id              TEXT PRIMARY KEY,
    chat_id         TEXT NOT NULL,
    parent_id       TEXT DEFAULT NULL,
    role            TEXT NOT NULL,
    content         TEXT NOT NULL,
    is_branch_root  INTEGER NOT NULL DEFAULT 0,
    branch_prompt   TEXT DEFAULT NULL,
    branch_context  TEXT DEFAULT NULL,
    branch_source_message_id TEXT DEFAULT NULL,
    branch_char_start INTEGER DEFAULT NULL,
    branch_char_end   INTEGER DEFAULT NULL,
    preview_summary TEXT DEFAULT NULL,
    sibling_index   INTEGER NOT NULL DEFAULT 0,
    provider        TEXT DEFAULT NULL,
    model           TEXT DEFAULT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES messages(id) ON DELETE CASCADE,
    FOREIGN KEY (branch_source_message_id) REFERENCES messages(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_messages_parent ON messages(parent_id);
CREATE INDEX IF NOT EXISTS idx_messages_branch_source ON messages(branch_source_message_id);

CREATE TABLE IF NOT EXISTS memories (
    id              TEXT PRIMARY KEY,
    content         TEXT NOT NULL,
    source_chat_id  TEXT DEFAULT NULL,
    source_message_id TEXT DEFAULT NULL,
    embedding       BLOB NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    last_accessed_at TEXT NOT NULL DEFAULT (datetime('now')),
    access_count    INTEGER NOT NULL DEFAULT 0,
    strength        REAL NOT NULL DEFAULT 1.0,
    FOREIGN KEY (source_chat_id) REFERENCES chats(id) ON DELETE SET NULL,
    FOREIGN KEY (source_message_id) REFERENCES messages(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS knowledge_bases (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT DEFAULT '',
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS knowledge_base_entries (
    id                  TEXT PRIMARY KEY,
    knowledge_base_id   TEXT NOT NULL,
    memory_id           TEXT DEFAULT NULL,
    content             TEXT NOT NULL,
    embedding           BLOB NOT NULL,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE,
    FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_kb_entries_kb ON knowledge_base_entries(knowledge_base_id);
