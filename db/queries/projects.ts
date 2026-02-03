import { getDb } from "@/db";
import { v4 as uuidv4 } from "uuid";
import type { Project } from "@/types";

interface ProjectRow {
  id: string;
  title: string;
  icon: string | null;
  created_at: string;
  updated_at: string;
}

function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    title: row.title,
    icon: row.icon,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createProject(title: string, icon?: string): Project {
  const db = getDb();
  const id = uuidv4();
  db.prepare("INSERT INTO projects (id, title, icon) VALUES (?, ?, ?)").run(
    id,
    title,
    icon || null
  );
  return getProject(id)!;
}

export function getProject(id: string): Project | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM projects WHERE id = ?")
    .get(id) as ProjectRow | undefined;
  return row ? rowToProject(row) : null;
}

export function listProjects(): Project[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM projects ORDER BY updated_at DESC")
    .all() as ProjectRow[];
  return rows.map(rowToProject);
}

export function renameProject(id: string, title: string): void {
  const db = getDb();
  db.prepare(
    "UPDATE projects SET title = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(title, id);
}

export function deleteProject(id: string): void {
  const db = getDb();
  db.prepare("DELETE FROM projects WHERE id = ?").run(id);
}

export function assignChatToProject(chatId: string, projectId: string | null): void {
  const db = getDb();
  db.prepare(
    "UPDATE chats SET project_id = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(projectId, chatId);
}
