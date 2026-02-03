import { getDb } from "@/db";
import { v4 as uuidv4 } from "uuid";
import type { Chat } from "@/types";

interface ChatRow {
  id: string;
  title: string;
  starred: number;
  project_id: string | null;
  created_at: string;
  updated_at: string;
}

function rowToChat(row: ChatRow): Chat {
  return {
    id: row.id,
    title: row.title,
    starred: row.starred === 1,
    projectId: row.project_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createChat(title?: string): Chat {
  const db = getDb();
  const id = uuidv4();
  db.prepare("INSERT INTO chats (id, title) VALUES (?, ?)").run(
    id,
    title || "New Chat"
  );
  return getChat(id)!;
}

export function getChat(id: string): Chat | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM chats WHERE id = ?")
    .get(id) as ChatRow | undefined;
  return row ? rowToChat(row) : null;
}

export function listChats(query?: string): Chat[] {
  const db = getDb();
  if (query) {
    const rows = db
      .prepare(
        `SELECT c.* FROM chats c
         WHERE c.title LIKE ?
         AND EXISTS (SELECT 1 FROM messages m WHERE m.chat_id = c.id)
         ORDER BY c.starred DESC, c.updated_at DESC`
      )
      .all(`%${query}%`) as ChatRow[];
    return rows.map(rowToChat);
  }
  const rows = db
    .prepare(
      `SELECT c.* FROM chats c
       WHERE EXISTS (SELECT 1 FROM messages m WHERE m.chat_id = c.id)
       ORDER BY c.starred DESC, c.updated_at DESC`
    )
    .all() as ChatRow[];
  return rows.map(rowToChat);
}

export function renameChat(id: string, title: string): void {
  const db = getDb();
  db.prepare(
    "UPDATE chats SET title = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(title, id);
}

export function deleteChat(id: string): void {
  const db = getDb();
  db.prepare("DELETE FROM chats WHERE id = ?").run(id);
}

export function touchChat(id: string): void {
  const db = getDb();
  db.prepare("UPDATE chats SET updated_at = datetime('now') WHERE id = ?").run(
    id
  );
}

export function deleteAllChats(): void {
  const db = getDb();
  db.prepare("DELETE FROM chats").run();
}

export function starChat(id: string, starred: boolean): void {
  const db = getDb();
  db.prepare(
    "UPDATE chats SET starred = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(starred ? 1 : 0, id);
}
