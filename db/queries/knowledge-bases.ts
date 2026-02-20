import { getDb } from "@/db";
import { v4 as uuidv4 } from "uuid";
import { cosineSimilarity } from "@/lib/utils";
import type { KnowledgeBase, KnowledgeBaseEntry } from "@/types";

function embeddingToBase64(embedding: number[]): string {
  const buf = Buffer.from(new Float32Array(embedding).buffer);
  return buf.toString('base64');
}

function base64ToEmbedding(b64: string): Float32Array {
  const buf = Buffer.from(b64, 'base64');
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

function rowToKB(row: any): KnowledgeBase {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToEntry(row: any): KnowledgeBaseEntry {
  return {
    id: row.id,
    knowledgeBaseId: row.knowledge_base_id,
    memoryId: row.memory_id,
    content: row.content,
    embedding: typeof row.embedding === 'string'
      ? base64ToEmbedding(row.embedding)
      : new Float32Array(0),
    embeddingModel: row.embedding_model,
    createdAt: row.created_at,
  };
}

export async function createKnowledgeBase(name: string, description?: string, userId?: string | null): Promise<KnowledgeBase> {
  const db = getDb();
  const id = uuidv4();
  const { data, error } = await db
    .from('knowledge_bases')
    .insert({ id, name, description: description || '', user_id: userId || null })
    .select()
    .single();
  if (error) throw error;
  return rowToKB(data);
}

export async function getKnowledgeBase(id: string): Promise<KnowledgeBase | null> {
  const db = getDb();
  const { data, error } = await db.from('knowledge_bases').select('*').eq('id', id).single();
  if (error || !data) return null;
  const kb = rowToKB(data);
  const { count } = await db.from('knowledge_base_entries').select('*', { count: 'exact', head: true }).eq('knowledge_base_id', id);
  kb.entryCount = count || 0;
  return kb;
}

export async function listKnowledgeBases(userId?: string | null): Promise<KnowledgeBase[]> {
  const db = getDb();
  let q = db.from('knowledge_bases').select('*').order('updated_at', { ascending: false });
  if (userId) q = q.eq('user_id', userId);
  const { data, error } = await q;
  if (error || !data) return [];

  const result: KnowledgeBase[] = [];
  for (const row of data) {
    const kb = rowToKB(row);
    const { count } = await db.from('knowledge_base_entries').select('*', { count: 'exact', head: true }).eq('knowledge_base_id', row.id);
    kb.entryCount = count || 0;
    result.push(kb);
  }
  return result;
}

export async function updateKnowledgeBase(id: string, params: { name?: string; description?: string }): Promise<void> {
  const db = getDb();
  const updates: Record<string, any> = { updated_at: new Date().toISOString() };
  if (params.name !== undefined) updates.name = params.name;
  if (params.description !== undefined) updates.description = params.description;
  await db.from('knowledge_bases').update(updates).eq('id', id);
}

export async function deleteKnowledgeBase(id: string): Promise<void> {
  const db = getDb();
  await db.from('knowledge_bases').delete().eq('id', id);
}

export async function addKBEntry(params: {
  knowledgeBaseId: string;
  content: string;
  embedding: number[];
  embeddingModel?: string | null;
  memoryId?: string | null;
}): Promise<KnowledgeBaseEntry> {
  const db = getDb();
  const id = uuidv4();
  const { data, error } = await db
    .from('knowledge_base_entries')
    .insert({
      id,
      knowledge_base_id: params.knowledgeBaseId,
      memory_id: params.memoryId || null,
      content: params.content,
      embedding: embeddingToBase64(params.embedding),
      embedding_model: params.embeddingModel || null,
    })
    .select()
    .single();
  if (error) throw error;
  return rowToEntry(data);
}

export async function getKBEntry(id: string): Promise<KnowledgeBaseEntry | null> {
  const db = getDb();
  const { data, error } = await db.from('knowledge_base_entries').select('*').eq('id', id).single();
  if (error || !data) return null;
  return rowToEntry(data);
}

export async function listKBEntries(knowledgeBaseId: string): Promise<KnowledgeBaseEntry[]> {
  const db = getDb();
  const { data, error } = await db
    .from('knowledge_base_entries')
    .select('*')
    .eq('knowledge_base_id', knowledgeBaseId)
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return data.map(rowToEntry);
}

export async function deleteKBEntry(id: string): Promise<void> {
  const db = getDb();
  await db.from('knowledge_base_entries').delete().eq('id', id);
}

export async function searchKBEntries(
  queryEmbedding: number[],
  topK: number = 5,
  knowledgeBaseId?: string,
  embeddingModel?: string | null
): Promise<(KnowledgeBaseEntry & { similarityScore: number })[]> {
  const db = getDb();
  let q = db.from('knowledge_base_entries').select('*');
  if (knowledgeBaseId) q = q.eq('knowledge_base_id', knowledgeBaseId);
  const { data: rows, error } = await q;
  if (error || !rows) return [];

  const compatible = embeddingModel
    ? rows.filter((r: any) => r.embedding_model === embeddingModel || r.embedding_model === null)
    : rows;

  const entries = compatible.map((row: any) => {
    const entry = rowToEntry(row);
    const entryEmbedding = Array.from(entry.embedding);
    const similarityScore = cosineSimilarity(queryEmbedding, entryEmbedding);
    return { ...entry, similarityScore };
  });

  entries.sort((a: any, b: any) => b.similarityScore - a.similarityScore);
  return entries.slice(0, topK);
}
