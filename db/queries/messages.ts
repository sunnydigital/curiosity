import { getDb } from "@/db";
import { v4 as uuidv4 } from "uuid";
import type { Message } from "@/types";

interface MessageRow {
  id: string;
  chat_id: string;
  parent_id: string | null;
  role: string;
  content: string;
  is_branch_root: number;
  branch_prompt: string | null;
  branch_context: string | null;
  branch_source_message_id: string | null;
  branch_char_start: number | null;
  branch_char_end: number | null;
  preview_summary: string | null;
  sibling_index: number;
  provider: string | null;
  model: string | null;
  created_at: string;
}

function rowToMessage(row: MessageRow): Message {
  return {
    id: row.id,
    chatId: row.chat_id,
    parentId: row.parent_id,
    role: row.role as Message["role"],
    content: row.content,
    isBranchRoot: row.is_branch_root === 1,
    branchPrompt: row.branch_prompt,
    branchContext: row.branch_context,
    branchSourceMessageId: row.branch_source_message_id,
    branchCharStart: row.branch_char_start,
    branchCharEnd: row.branch_char_end,
    previewSummary: row.preview_summary,
    siblingIndex: row.sibling_index,
    provider: row.provider,
    model: row.model,
    createdAt: row.created_at,
  };
}

export function createMessage(params: {
  chatId: string;
  parentId?: string | null;
  role: Message["role"];
  content: string;
  isBranchRoot?: boolean;
  branchPrompt?: string | null;
  branchContext?: string | null;
  branchSourceMessageId?: string | null;
  branchCharStart?: number | null;
  branchCharEnd?: number | null;
  provider?: string | null;
  model?: string | null;
}): Message {
  const db = getDb();
  const id = uuidv4();

  let siblingIndex = 0;
  if (params.parentId) {
    const countRow = db
      .prepare("SELECT COUNT(*) as cnt FROM messages WHERE parent_id = ?")
      .get(params.parentId) as { cnt: number };
    siblingIndex = countRow.cnt;
  }

  db.prepare(
    `INSERT INTO messages (id, chat_id, parent_id, role, content, is_branch_root,
     branch_prompt, branch_context, branch_source_message_id, branch_char_start,
     branch_char_end, sibling_index, provider, model)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    params.chatId,
    params.parentId || null,
    params.role,
    params.content,
    params.isBranchRoot ? 1 : 0,
    params.branchPrompt || null,
    params.branchContext || null,
    params.branchSourceMessageId || null,
    params.branchCharStart ?? null,
    params.branchCharEnd ?? null,
    siblingIndex,
    params.provider || null,
    params.model || null
  );

  return getMessage(id)!;
}

export function getMessage(id: string): Message | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM messages WHERE id = ?")
    .get(id) as MessageRow | undefined;
  return row ? rowToMessage(row) : null;
}

export function getMessagesByChat(chatId: string): Message[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC")
    .all(chatId) as MessageRow[];
  return rows.map(rowToMessage);
}

export function getPathToRoot(messageId: string): Message[] {
  const db = getDb();
  const rows = db
    .prepare(
      `WITH RECURSIVE ancestors AS (
        SELECT * FROM messages WHERE id = ?
        UNION ALL
        SELECT m.* FROM messages m JOIN ancestors a ON m.id = a.parent_id
      )
      SELECT * FROM ancestors ORDER BY created_at ASC`
    )
    .all(messageId) as MessageRow[];
  return rows.map(rowToMessage);
}

export function getSubtree(messageId: string): Message[] {
  const db = getDb();
  const rows = db
    .prepare(
      `WITH RECURSIVE descendants AS (
        SELECT * FROM messages WHERE id = ?
        UNION ALL
        SELECT m.* FROM messages m JOIN descendants d ON m.parent_id = d.id
      )
      SELECT * FROM descendants ORDER BY created_at ASC`
    )
    .all(messageId) as MessageRow[];
  return rows.map(rowToMessage);
}

export function getChildren(messageId: string): Message[] {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT * FROM messages WHERE parent_id = ? ORDER BY sibling_index ASC"
    )
    .all(messageId) as MessageRow[];
  return rows.map(rowToMessage);
}

export function getBranches(messageId: string): Message[] {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT * FROM messages WHERE branch_source_message_id = ? AND is_branch_root = 1 ORDER BY created_at ASC"
    )
    .all(messageId) as MessageRow[];
  return rows.map(rowToMessage);
}

export function getRootMessage(chatId: string): Message | null {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT * FROM messages WHERE chat_id = ? AND parent_id IS NULL ORDER BY created_at ASC LIMIT 1"
    )
    .get(chatId) as MessageRow | undefined;
  return row ? rowToMessage(row) : null;
}

export function getMainPath(chatId: string): Message[] {
  const db = getDb();
  const root = getRootMessage(chatId);
  if (!root) return [];

  const messages: Message[] = [root];
  let current = root;

  while (true) {
    const children = db
      .prepare(
        "SELECT * FROM messages WHERE parent_id = ? ORDER BY sibling_index ASC LIMIT 1"
      )
      .get(current.id) as MessageRow | undefined;
    if (!children) break;
    const msg = rowToMessage(children);
    messages.push(msg);
    current = msg;
  }

  return messages;
}

export function updatePreviewSummary(
  messageId: string,
  summary: string
): void {
  const db = getDb();
  db.prepare("UPDATE messages SET preview_summary = ? WHERE id = ?").run(
    summary,
    messageId
  );
}

export function deleteBranch(messageId: string): void {
  const db = getDb();
  // Delete the message and all its descendants using recursive CTE
  db.prepare(
    `WITH RECURSIVE descendants AS (
      SELECT id FROM messages WHERE id = ?
      UNION ALL
      SELECT m.id FROM messages m JOIN descendants d ON m.parent_id = d.id
    )
    DELETE FROM messages WHERE id IN (SELECT id FROM descendants)`
  ).run(messageId);
}
