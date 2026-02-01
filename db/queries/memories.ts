import { getDb } from "@/db";
import { v4 as uuidv4 } from "uuid";
import { embeddingToBuffer, bufferToEmbedding, cosineSimilarity } from "@/lib/utils";
import type { Memory } from "@/types";

interface MemoryRow {
  id: string;
  content: string;
  source_chat_id: string | null;
  source_message_id: string | null;
  embedding: Buffer;
  created_at: string;
  last_accessed_at: string;
  access_count: number;
  strength: number;
}

function rowToMemory(row: MemoryRow): Memory {
  return {
    id: row.id,
    content: row.content,
    sourceChatId: row.source_chat_id,
    sourceMessageId: row.source_message_id,
    embedding: new Float32Array(
      row.embedding.buffer,
      row.embedding.byteOffset,
      row.embedding.byteLength / 4
    ),
    createdAt: row.created_at,
    lastAccessedAt: row.last_accessed_at,
    accessCount: row.access_count,
    strength: row.strength,
  };
}

export function createMemory(params: {
  content: string;
  sourceChatId?: string | null;
  sourceMessageId?: string | null;
  embedding: number[];
}): Memory {
  const db = getDb();
  const id = uuidv4();
  const embeddingBuf = embeddingToBuffer(params.embedding);

  db.prepare(
    `INSERT INTO memories (id, content, source_chat_id, source_message_id, embedding)
     VALUES (?, ?, ?, ?, ?)`
  ).run(
    id,
    params.content,
    params.sourceChatId || null,
    params.sourceMessageId || null,
    embeddingBuf
  );

  return getMemory(id)!;
}

export function getMemory(id: string): Memory | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM memories WHERE id = ?")
    .get(id) as MemoryRow | undefined;
  return row ? rowToMemory(row) : null;
}

export function getAllMemories(): Memory[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM memories ORDER BY created_at DESC")
    .all() as MemoryRow[];
  return rows.map(rowToMemory);
}

export function searchMemories(
  queryEmbedding: number[],
  options: {
    lambda: number;
    similarityWeight: number;
    temporalWeight: number;
    topK: number;
  }
): (Memory & { similarityScore: number; temporalScore: number; combinedScore: number })[] {
  const memories = getAllMemories();
  const now = Date.now();

  const scored = memories.map((memory) => {
    const memEmbedding = Array.from(memory.embedding);
    const similarityScore = cosineSimilarity(queryEmbedding, memEmbedding);

    const ageSeconds =
      (now - new Date(memory.lastAccessedAt).getTime()) / 1000;
    const temporalScore = Math.exp(
      (-options.lambda * ageSeconds) / memory.strength
    );

    const combinedScore =
      options.similarityWeight * similarityScore +
      options.temporalWeight * temporalScore;

    return { ...memory, similarityScore, temporalScore, combinedScore };
  });

  scored.sort((a, b) => b.combinedScore - a.combinedScore);
  return scored.slice(0, options.topK);
}

export function updateMemoryAccess(id: string): void {
  const db = getDb();
  const memory = getMemory(id);
  if (!memory) return;

  const newStrength = Math.min(1.0, memory.strength + 0.1 * (1 - memory.strength));

  db.prepare(
    `UPDATE memories SET
     last_accessed_at = datetime('now'),
     access_count = access_count + 1,
     strength = ?
     WHERE id = ?`
  ).run(newStrength, id);
}

export function deleteMemory(id: string): void {
  const db = getDb();
  db.prepare("DELETE FROM memories WHERE id = ?").run(id);
}
