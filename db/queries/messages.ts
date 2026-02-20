import { getDb } from "@/db";
import { v4 as uuidv4 } from "uuid";
import type { Message } from "@/types";

function rowToMessage(row: any): Message {
  return {
    id: row.id,
    chatId: row.chat_id,
    parentId: row.parent_id,
    role: row.role as Message["role"],
    content: row.content,
    isBranchRoot: row.is_branch_root === true,
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

export async function createMessage(params: {
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
}): Promise<Message> {
  const db = getDb();
  const id = uuidv4();

  let siblingIndex = 0;
  if (params.parentId) {
    const { count } = await db
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('parent_id', params.parentId);
    siblingIndex = count || 0;
  }

  const { data, error } = await db
    .from('messages')
    .insert({
      id,
      chat_id: params.chatId,
      parent_id: params.parentId || null,
      role: params.role,
      content: params.content,
      is_branch_root: params.isBranchRoot || false,
      branch_prompt: params.branchPrompt || null,
      branch_context: params.branchContext || null,
      branch_source_message_id: params.branchSourceMessageId || null,
      branch_char_start: params.branchCharStart ?? null,
      branch_char_end: params.branchCharEnd ?? null,
      sibling_index: siblingIndex,
      provider: params.provider || null,
      model: params.model || null,
    })
    .select()
    .single();

  if (error) throw error;
  return rowToMessage(data);
}

export async function getMessage(id: string): Promise<Message | null> {
  const db = getDb();
  const { data, error } = await db
    .from('messages')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) return null;
  return rowToMessage(data);
}

export async function getMessagesByChat(chatId: string): Promise<Message[]> {
  const db = getDb();
  const { data, error } = await db
    .from('messages')
    .select('*')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true });

  if (error || !data) return [];
  return data.map(rowToMessage);
}

export async function getPathToRoot(messageId: string): Promise<Message[]> {
  // Supabase doesn't support recursive CTEs directly, so we walk up manually
  const db = getDb();
  const messages: Message[] = [];
  let currentId: string | null = messageId;

  while (currentId) {
    const result: { data: any; error: any } = await db
      .from('messages')
      .select('*')
      .eq('id', currentId)
      .single();

    if (result.error || !result.data) break;
    messages.unshift(rowToMessage(result.data));
    currentId = result.data.parent_id;
  }

  return messages;
}

export async function getSubtree(messageId: string): Promise<Message[]> {
  // Walk down from message collecting all descendants
  const db = getDb();
  const result: Message[] = [];
  const queue = [messageId];

  while (queue.length > 0) {
    const id = queue.shift()!;
    const msgResult: { data: any } = await db.from('messages').select('*').eq('id', id).single();
    if (msgResult.data) {
      result.push(rowToMessage(msgResult.data));
      const childResult: { data: any } = await db.from('messages').select('id').eq('parent_id', id);
      if (childResult.data) queue.push(...childResult.data.map((c: any) => c.id));
    }
  }

  return result.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

export async function getChildren(messageId: string): Promise<Message[]> {
  const db = getDb();
  const { data, error } = await db
    .from('messages')
    .select('*')
    .eq('parent_id', messageId)
    .order('sibling_index', { ascending: true });

  if (error || !data) return [];
  return data.map(rowToMessage);
}

export async function getBranches(messageId: string): Promise<Message[]> {
  const db = getDb();
  const { data, error } = await db
    .from('messages')
    .select('*')
    .eq('branch_source_message_id', messageId)
    .eq('is_branch_root', true)
    .order('created_at', { ascending: true });

  if (error || !data) return [];
  return data.map(rowToMessage);
}

export async function getRootMessage(chatId: string): Promise<Message | null> {
  const db = getDb();
  const { data, error } = await db
    .from('messages')
    .select('*')
    .eq('chat_id', chatId)
    .is('parent_id', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (error || !data) return null;
  return rowToMessage(data);
}

export async function getMainPath(chatId: string): Promise<Message[]> {
  const root = await getRootMessage(chatId);
  if (!root) return [];

  const messages: Message[] = [root];
  let current = root;

  while (true) {
    const db = getDb();
    const { data, error } = await db
      .from('messages')
      .select('*')
      .eq('parent_id', current.id)
      .order('sibling_index', { ascending: true })
      .limit(1)
      .single();

    if (error || !data) break;
    const msg = rowToMessage(data);
    messages.push(msg);
    current = msg;
  }

  return messages;
}

export async function updatePreviewSummary(messageId: string, summary: string): Promise<void> {
  const db = getDb();
  await db.from('messages').update({ preview_summary: summary }).eq('id', messageId);
}

export async function deleteMessage(messageId: string): Promise<boolean> {
  const db = getDb();
  const { count } = await db
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('parent_id', messageId);

  if ((count || 0) > 0) return false;
  await db.from('messages').delete().eq('id', messageId);
  return true;
}

export async function deleteBranch(messageId: string): Promise<void> {
  // Collect all descendant IDs then delete
  const subtree = await getSubtree(messageId);
  const ids = subtree.map(m => m.id);
  if (ids.length === 0) return;

  const db = getDb();
  // Delete in reverse order (leaves first) to respect FK constraints
  for (let i = ids.length - 1; i >= 0; i--) {
    await db.from('messages').delete().eq('id', ids[i]);
  }
}
