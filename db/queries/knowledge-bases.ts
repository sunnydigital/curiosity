import { getDb } from "@/db";
import { v4 as uuidv4 } from "uuid";
import { embeddingToBuffer, bufferToEmbedding, cosineSimilarity } from "@/lib/utils";
import type { KnowledgeBase, KnowledgeBaseEntry } from "@/types";

interface KBRow {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

interface KBEntryRow {
  id: string;
  knowledge_base_id: string;
  memory_id: string | null;
  content: string;
  embedding: Buffer;
  created_at: string;
}

function rowToKB(row: KBRow): KnowledgeBase {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToEntry(row: KBEntryRow): KnowledgeBaseEntry {
  return {
    id: row.id,
    knowledgeBaseId: row.knowledge_base_id,
    memoryId: row.memory_id,
    content: row.content,
    embedding: new Float32Array(
      row.embedding.buffer,
      row.embedding.byteOffset,
      row.embedding.byteLength / 4
    ),
    createdAt: row.created_at,
  };
}

export function createKnowledgeBase(name: string, description?: string): KnowledgeBase {
  const db = getDb();
  const id = uuidv4();
  db.prepare("INSERT INTO knowledge_bases (id, name, description) VALUES (?, ?, ?)").run(
    id,
    name,
    description || ""
  );
  return getKnowledgeBase(id)!;
}

export function getKnowledgeBase(id: string): KnowledgeBase | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM knowledge_bases WHERE id = ?")
    .get(id) as KBRow | undefined;
  if (!row) return null;
  const kb = rowToKB(row);
  const count = db
    .prepare("SELECT COUNT(*) as cnt FROM knowledge_base_entries WHERE knowledge_base_id = ?")
    .get(id) as { cnt: number };
  kb.entryCount = count.cnt;
  return kb;
}

export function listKnowledgeBases(): KnowledgeBase[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM knowledge_bases ORDER BY updated_at DESC")
    .all() as KBRow[];
  return rows.map((row) => {
    const kb = rowToKB(row);
    const count = db
      .prepare("SELECT COUNT(*) as cnt FROM knowledge_base_entries WHERE knowledge_base_id = ?")
      .get(row.id) as { cnt: number };
    kb.entryCount = count.cnt;
    return kb;
  });
}

export function updateKnowledgeBase(
  id: string,
  params: { name?: string; description?: string }
): void {
  const db = getDb();
  const updates: string[] = [];
  const values: any[] = [];
  if (params.name !== undefined) {
    updates.push("name = ?");
    values.push(params.name);
  }
  if (params.description !== undefined) {
    updates.push("description = ?");
    values.push(params.description);
  }
  if (updates.length === 0) return;
  updates.push("updated_at = datetime('now')");
  values.push(id);
  db.prepare(`UPDATE knowledge_bases SET ${updates.join(", ")} WHERE id = ?`).run(...values);
}

export function deleteKnowledgeBase(id: string): void {
  const db = getDb();
  db.prepare("DELETE FROM knowledge_bases WHERE id = ?").run(id);
}

export function addKBEntry(params: {
  knowledgeBaseId: string;
  content: string;
  embedding: number[];
  memoryId?: string | null;
}): KnowledgeBaseEntry {
  const db = getDb();
  const id = uuidv4();
  const embeddingBuf = embeddingToBuffer(params.embedding);
  db.prepare(
    `INSERT INTO knowledge_base_entries (id, knowledge_base_id, memory_id, content, embedding)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, params.knowledgeBaseId, params.memoryId || null, params.content, embeddingBuf);
  return getKBEntry(id)!;
}

export function getKBEntry(id: string): KnowledgeBaseEntry | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM knowledge_base_entries WHERE id = ?")
    .get(id) as KBEntryRow | undefined;
  return row ? rowToEntry(row) : null;
}

export function listKBEntries(knowledgeBaseId: string): KnowledgeBaseEntry[] {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT * FROM knowledge_base_entries WHERE knowledge_base_id = ? ORDER BY created_at DESC"
    )
    .all(knowledgeBaseId) as KBEntryRow[];
  return rows.map(rowToEntry);
}

export function deleteKBEntry(id: string): void {
  const db = getDb();
  db.prepare("DELETE FROM knowledge_base_entries WHERE id = ?").run(id);
}

export function searchKBEntries(
  queryEmbedding: number[],
  topK: number = 5,
  knowledgeBaseId?: string
): (KnowledgeBaseEntry & { similarityScore: number })[] {
  const db = getDb();
  let rows: KBEntryRow[];
  if (knowledgeBaseId) {
    rows = db
      .prepare("SELECT * FROM knowledge_base_entries WHERE knowledge_base_id = ?")
      .all(knowledgeBaseId) as KBEntryRow[];
  } else {
    rows = db.prepare("SELECT * FROM knowledge_base_entries").all() as KBEntryRow[];
  }

  const entries = rows.map((row) => {
    const entry = rowToEntry(row);
    const entryEmbedding = Array.from(entry.embedding);
    const similarityScore = cosineSimilarity(queryEmbedding, entryEmbedding);
    return { ...entry, similarityScore };
  });

  entries.sort((a, b) => b.similarityScore - a.similarityScore);
  return entries.slice(0, topK);
}
