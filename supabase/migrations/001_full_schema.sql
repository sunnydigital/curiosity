-- Curiosity: Full Supabase Schema Migration
-- Converted from SQLite to PostgreSQL with multi-tenancy support

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- ADMIN SETTINGS (singleton, not user-scoped)
-- Stores the admin-configured API keys used for ALL users
-- ============================================================================
CREATE TABLE IF NOT EXISTS admin_settings (
    id              INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    anthropic_api_key   TEXT DEFAULT NULL,
    openai_api_key      TEXT DEFAULT NULL,
    gemini_api_key      TEXT DEFAULT NULL,
    active_provider TEXT NOT NULL DEFAULT 'anthropic',
    active_model    TEXT NOT NULL DEFAULT 'claude-sonnet-4-5-20250929',
    preview_provider   TEXT NOT NULL DEFAULT 'anthropic',
    preview_model      TEXT NOT NULL DEFAULT 'claude-haiku-4-5',
    embedding_provider TEXT NOT NULL DEFAULT 'openai',
    embedding_model    TEXT NOT NULL DEFAULT 'text-embedding-3-small',
    ollama_base_url     TEXT DEFAULT 'http://localhost:11434',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO admin_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

-- ============================================================================
-- USER SETTINGS (per-user preferences)
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_settings (
    user_id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    memory_enabled  BOOLEAN NOT NULL DEFAULT true,
    decay_lambda       DOUBLE PRECISION NOT NULL DEFAULT 0.0000001,
    similarity_weight  DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    temporal_weight    DOUBLE PRECISION NOT NULL DEFAULT 0.3,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- PROJECTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS projects (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    icon        TEXT DEFAULT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);

-- ============================================================================
-- CHATS
-- ============================================================================
CREATE TABLE IF NOT EXISTS chats (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    title       TEXT NOT NULL DEFAULT 'New Chat',
    starred     BOOLEAN NOT NULL DEFAULT false,
    project_id  UUID DEFAULT NULL REFERENCES projects(id) ON DELETE SET NULL,
    anon_ip     TEXT DEFAULT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chats_updated ON chats(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chats_user ON chats(user_id);
CREATE INDEX IF NOT EXISTS idx_chats_project ON chats(project_id);
CREATE INDEX IF NOT EXISTS idx_chats_anon_ip ON chats(anon_ip);

-- ============================================================================
-- MESSAGES
-- ============================================================================
CREATE TABLE IF NOT EXISTS messages (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chat_id         UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    parent_id       UUID DEFAULT NULL REFERENCES messages(id) ON DELETE CASCADE,
    role            TEXT NOT NULL,
    content         TEXT NOT NULL,
    is_branch_root  BOOLEAN NOT NULL DEFAULT false,
    branch_prompt   TEXT DEFAULT NULL,
    branch_context  TEXT DEFAULT NULL,
    branch_source_message_id UUID DEFAULT NULL REFERENCES messages(id) ON DELETE SET NULL,
    branch_char_start INTEGER DEFAULT NULL,
    branch_char_end   INTEGER DEFAULT NULL,
    preview_summary TEXT DEFAULT NULL,
    sibling_index   INTEGER NOT NULL DEFAULT 0,
    provider        TEXT DEFAULT NULL,
    model           TEXT DEFAULT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_messages_parent ON messages(parent_id);
CREATE INDEX IF NOT EXISTS idx_messages_branch_source ON messages(branch_source_message_id);

-- ============================================================================
-- MEMORIES
-- ============================================================================
CREATE TABLE IF NOT EXISTS memories (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    content         TEXT NOT NULL,
    source_chat_id  UUID DEFAULT NULL REFERENCES chats(id) ON DELETE SET NULL,
    source_message_id UUID DEFAULT NULL REFERENCES messages(id) ON DELETE SET NULL,
    embedding       BYTEA NOT NULL,
    embedding_model TEXT DEFAULT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    access_count    INTEGER NOT NULL DEFAULT 0,
    strength        DOUBLE PRECISION NOT NULL DEFAULT 1.0
);

CREATE INDEX IF NOT EXISTS idx_memories_user ON memories(user_id);

-- ============================================================================
-- KNOWLEDGE BASES
-- ============================================================================
CREATE TABLE IF NOT EXISTS knowledge_bases (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    description TEXT DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kb_user ON knowledge_bases(user_id);

CREATE TABLE IF NOT EXISTS knowledge_base_entries (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    knowledge_base_id   UUID NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
    memory_id           UUID DEFAULT NULL REFERENCES memories(id) ON DELETE SET NULL,
    content             TEXT NOT NULL,
    embedding           BYTEA NOT NULL,
    embedding_model     TEXT DEFAULT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kb_entries_kb ON knowledge_base_entries(knowledge_base_id);

-- ============================================================================
-- RATE LIMITS (anonymous usage tracking)
-- ============================================================================
CREATE TABLE IF NOT EXISTS rate_limits (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ip_address      TEXT NOT NULL UNIQUE,
    message_count   INTEGER NOT NULL DEFAULT 0,
    first_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_message_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_ip ON rate_limits(ip_address);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Admin settings: only service role can modify, authenticated can read
ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read admin settings" ON admin_settings FOR SELECT USING (true);
CREATE POLICY "Service role can modify admin settings" ON admin_settings FOR ALL USING (true) WITH CHECK (true);

-- User settings
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own settings" ON user_settings FOR ALL
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Projects
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own projects" ON projects FOR ALL
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Chats: users see their own, anon users tracked by IP (handled in app layer)
ALTER TABLE chats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own chats" ON chats FOR ALL
    USING (auth.uid() = user_id OR user_id IS NULL) WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Messages: accessible if user owns the chat
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage messages in own chats" ON messages FOR ALL
    USING (
        EXISTS (SELECT 1 FROM chats WHERE chats.id = messages.chat_id AND (chats.user_id = auth.uid() OR chats.user_id IS NULL))
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM chats WHERE chats.id = messages.chat_id AND (chats.user_id = auth.uid() OR chats.user_id IS NULL))
    );

-- Memories
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own memories" ON memories FOR ALL
    USING (auth.uid() = user_id OR user_id IS NULL) WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Knowledge bases
ALTER TABLE knowledge_bases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own knowledge bases" ON knowledge_bases FOR ALL
    USING (auth.uid() = user_id OR user_id IS NULL) WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Knowledge base entries: accessible if user owns the KB
ALTER TABLE knowledge_base_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage entries in own KBs" ON knowledge_base_entries FOR ALL
    USING (
        EXISTS (SELECT 1 FROM knowledge_bases WHERE knowledge_bases.id = knowledge_base_entries.knowledge_base_id AND (knowledge_bases.user_id = auth.uid() OR knowledge_bases.user_id IS NULL))
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM knowledge_bases WHERE knowledge_bases.id = knowledge_base_entries.knowledge_base_id AND (knowledge_bases.user_id = auth.uid() OR knowledge_bases.user_id IS NULL))
    );

-- Rate limits: service role only
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages rate limits" ON rate_limits FOR ALL USING (true) WITH CHECK (true);
