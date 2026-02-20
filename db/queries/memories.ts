import { getDb } from "@/db";
import { v4 as uuidv4 } from "uuid";
import { cosineSimilarity } from "@/lib/utils";
import type { Memory } from "@/types";

function embeddingToBase64(embedding: number[]): string {
  const buf = Buffer.from(new Float32Array(embedding).buffer);
  return buf.toString('base64');
}

function base64ToEmbedding(b64: string): Float32Array {
  const buf = Buffer.from(b64, 'base64');
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

function rowToMemory(row: any): Memory {
  return {
    id: row.id,
    content: row.content,
    sourceChatId: row.source_chat_id,
    sourceMessageId: row.source_message_id,
    embedding: typeof row.embedding === 'string'
      ? base64ToEmbedding(row.embedding)
      : new Float32Array(0),
    embeddingModel: row.embedding_model,
    createdAt: row.created_at,
    lastAccessedAt: row.last_accessed_at,
    accessCount: row.access_count,
    strength: row.strength,
  };
}

export async function createMemory(params: {
  content: string;
  sourceChatId?: string | null;
  sourceMessageId?: string | null;
  embedding: number[];
  embeddingModel?: string | null;
  userId?: string | null;
}): Promise<Memory> {
  const db = getDb();
  const id = uuidv4();

  const { data, error } = await db
    .from('memories')
    .insert({
      id,
      content: params.content,
      source_chat_id: params.sourceChatId || null,
      source_message_id: params.sourceMessageId || null,
      embedding: embeddingToBase64(params.embedding),
      embedding_model: params.embeddingModel || null,
      user_id: params.userId || null,
    })
    .select()
    .single();

  if (error) throw error;
  return rowToMemory(data);
}

export async function getMemory(id: string): Promise<Memory | null> {
  const db = getDb();
  const { data, error } = await db.from('memories').select('*').eq('id', id).single();
  if (error || !data) return null;
  return rowToMemory(data);
}

export async function getAllMemories(userId?: string | null): Promise<Memory[]> {
  const db = getDb();
  let q = db.from('memories').select('*').order('created_at', { ascending: false });
  if (userId) q = q.eq('user_id', userId);
  const { data, error } = await q;
  if (error || !data) return [];
  return data.map(rowToMemory);
}

export async function searchMemories(
  queryEmbedding: number[],
  options: {
    lambda: number;
    similarityWeight: number;
    temporalWeight: number;
    topK: number;
    embeddingModel?: string | null;
    userId?: string | null;
  }
): Promise<(Memory & { similarityScore: number; temporalScore: number; combinedScore: number })[]> {
  const memories = await getAllMemories(options.userId);
  const now = Date.now();

  const compatible = options.embeddingModel
    ? memories.filter(m => m.embeddingModel === options.embeddingModel || m.embeddingModel === null)
    : memories;

  const scored = compatible.map((memory) => {
    const memEmbedding = Array.from(memory.embedding);
    const similarityScore = cosineSimilarity(queryEmbedding, memEmbedding);
    const ageSeconds = (now - new Date(memory.lastAccessedAt).getTime()) / 1000;
    const temporalScore = Math.exp((-options.lambda * ageSeconds) / memory.strength);
    const combinedScore = options.similarityWeight * similarityScore + options.temporalWeight * temporalScore;
    return { ...memory, similarityScore, temporalScore, combinedScore };
  });

  scored.sort((a, b) => b.combinedScore - a.combinedScore);
  return scored.slice(0, options.topK);
}

export async function updateMemoryAccess(id: string): Promise<void> {
  const memory = await getMemory(id);
  if (!memory) return;
  const newStrength = Math.min(1.0, memory.strength + 0.1 * (1 - memory.strength));
  const db = getDb();
  await db.from('memories').update({
    last_accessed_at: new Date().toISOString(),
    access_count: memory.accessCount + 1,
    strength: newStrength,
  }).eq('id', id);
}

export async function deleteMemory(id: string): Promise<void> {
  const db = getDb();
  await db.from('memories').delete().eq('id', id);
}

export async function deleteAllMemories(userId?: string): Promise<void> {
  const db = getDb();
  let q = db.from('memories').delete();
  if (userId) q = q.eq('user_id', userId);
  else q = q.neq('id', ''); // delete all
  await q;
}

export async function deleteMemoriesByEmbeddingModel(model: string | null, userId?: string): Promise<void> {
  const db = getDb();
  let q = db.from('memories').delete();
  if (model === null) {
    q = q.is('embedding_model', null);
  } else {
    q = q.eq('embedding_model', model);
  }
  if (userId) q = q.eq('user_id', userId);
  await q;
}

export async function getDistinctEmbeddingModels(userId?: string): Promise<(string | null)[]> {
  const memories = await getAllMemories(userId);
  const models = new Set(memories.map(m => m.embeddingModel));
  return Array.from(models);
}

export async function updateMemoryEmbedding(id: string, embedding: number[], embeddingModel: string): Promise<void> {
  const db = getDb();
  await db.from('memories').update({
    embedding: embeddingToBase64(embedding),
    embedding_model: embeddingModel,
  }).eq('id', id);
}

export async function getMemoriesByEmbeddingModel(model: string | null, userId?: string): Promise<Memory[]> {
  const db = getDb();
  let q = db.from('memories').select('*').order('created_at', { ascending: false });
  if (model === null) {
    q = q.is('embedding_model', null);
  } else {
    q = q.eq('embedding_model', model);
  }
  if (userId) q = q.eq('user_id', userId);
  const { data, error } = await q;
  if (error || !data) return [];
  return data.map(rowToMemory);
}
