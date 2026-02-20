import { getDb } from "@/db";
import { v4 as uuidv4 } from "uuid";
import type { Project } from "@/types";

function rowToProject(row: any): Project {
  return {
    id: row.id,
    title: row.title,
    icon: row.icon,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createProject(title: string, icon?: string, userId?: string | null): Promise<Project> {
  const db = getDb();
  const id = uuidv4();
  const { data, error } = await db
    .from('projects')
    .insert({ id, title, icon: icon || null, user_id: userId || null })
    .select()
    .single();
  if (error) throw error;
  return rowToProject(data);
}

export async function getProject(id: string): Promise<Project | null> {
  const db = getDb();
  const { data, error } = await db.from('projects').select('*').eq('id', id).single();
  if (error || !data) return null;
  return rowToProject(data);
}

export async function listProjects(userId?: string | null): Promise<Project[]> {
  const db = getDb();
  let q = db.from('projects').select('*').order('updated_at', { ascending: false });
  if (userId) q = q.eq('user_id', userId);
  const { data, error } = await q;
  if (error || !data) return [];
  return data.map(rowToProject);
}

export async function renameProject(id: string, title: string): Promise<void> {
  const db = getDb();
  await db.from('projects').update({ title, updated_at: new Date().toISOString() }).eq('id', id);
}

export async function deleteProject(id: string): Promise<void> {
  const db = getDb();
  await db.from('projects').delete().eq('id', id);
}

export async function assignChatToProject(chatId: string, projectId: string | null): Promise<void> {
  const db = getDb();
  await db.from('chats').update({ project_id: projectId, updated_at: new Date().toISOString() }).eq('id', chatId);
}
