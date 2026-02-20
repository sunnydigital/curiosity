import { getDb } from "@/db";
import { v4 as uuidv4 } from "uuid";
import type { Chat } from "@/types";

function rowToChat(row: any): Chat {
  return {
    id: row.id,
    title: row.title,
    starred: row.starred === true,
    projectId: row.project_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createChat(title?: string, userId?: string | null, anonIp?: string | null): Promise<Chat> {
  const db = getDb();
  const id = uuidv4();
  const { data, error } = await db
    .from('chats')
    .insert({
      id,
      title: title || 'New Chat',
      user_id: userId || null,
      anon_ip: anonIp || null,
    })
    .select()
    .single();

  if (error) throw error;
  return rowToChat(data);
}

export async function getChat(id: string): Promise<Chat | null> {
  const db = getDb();
  const { data, error } = await db
    .from('chats')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) return null;
  return rowToChat(data);
}

export async function listChats(userId?: string | null, anonIp?: string | null, query?: string): Promise<Chat[]> {
  const db = getDb();
  let q = db.from('chats').select('*');

  if (userId) {
    q = q.eq('user_id', userId);
  } else if (anonIp) {
    q = q.eq('anon_ip', anonIp).is('user_id', null);
  } else {
    return [];
  }

  if (query) {
    q = q.ilike('title', `%${query}%`);
  }

  // Only return chats that have messages
  const { data: chats, error } = await q.order('starred', { ascending: false }).order('updated_at', { ascending: false });

  if (error || !chats) return [];

  // Filter to chats with messages
  const chatIds = chats.map((c: any) => c.id);
  if (chatIds.length === 0) return [];

  const { data: msgData } = await db
    .from('messages')
    .select('chat_id')
    .in('chat_id', chatIds);

  const chatsWithMessages = new Set((msgData || []).map((m: any) => m.chat_id));
  return chats.filter((c: any) => chatsWithMessages.has(c.id)).map(rowToChat);
}

export async function renameChat(id: string, title: string): Promise<void> {
  const db = getDb();
  await db.from('chats').update({ title, updated_at: new Date().toISOString() }).eq('id', id);
}

export async function deleteChat(id: string): Promise<void> {
  const db = getDb();
  await db.from('chats').delete().eq('id', id);
}

export async function touchChat(id: string): Promise<void> {
  const db = getDb();
  await db.from('chats').update({ updated_at: new Date().toISOString() }).eq('id', id);
}

export async function deleteAllChats(userId?: string): Promise<void> {
  const db = getDb();
  let q = db.from('chats').delete();
  if (userId) q = q.eq('user_id', userId);
  await q;
}

export async function starChat(id: string, starred: boolean): Promise<void> {
  const db = getDb();
  await db.from('chats').update({ starred, updated_at: new Date().toISOString() }).eq('id', id);
}

export async function migrateAnonChatsToUser(anonIp: string, userId: string): Promise<number> {
  const db = getDb();
  const { data, error } = await db
    .from('chats')
    .update({ user_id: userId, anon_ip: null })
    .eq('anon_ip', anonIp)
    .is('user_id', null)
    .select('id');

  if (error) return 0;
  return data?.length || 0;
}
