import { getDb } from "@/db";

const ANON_MESSAGE_LIMIT = 20;

export interface RateLimitInfo {
  ipAddress: string;
  messageCount: number;
  firstMessageAt: string;
  lastMessageAt: string;
  remaining: number;
  isLimited: boolean;
}

export async function checkRateLimit(ipAddress: string): Promise<RateLimitInfo> {
  const db = getDb();
  const { data } = await db
    .from('rate_limits')
    .select('*')
    .eq('ip_address', ipAddress)
    .single();

  if (!data) {
    return {
      ipAddress,
      messageCount: 0,
      firstMessageAt: new Date().toISOString(),
      lastMessageAt: new Date().toISOString(),
      remaining: ANON_MESSAGE_LIMIT,
      isLimited: false,
    };
  }

  return {
    ipAddress: data.ip_address,
    messageCount: data.message_count,
    firstMessageAt: data.first_message_at,
    lastMessageAt: data.last_message_at,
    remaining: Math.max(0, ANON_MESSAGE_LIMIT - data.message_count),
    isLimited: data.message_count >= ANON_MESSAGE_LIMIT,
  };
}

export async function incrementRateLimit(ipAddress: string): Promise<RateLimitInfo> {
  const db = getDb();
  const { data: existing } = await db
    .from('rate_limits')
    .select('*')
    .eq('ip_address', ipAddress)
    .single();

  if (!existing) {
    await db.from('rate_limits').insert({
      ip_address: ipAddress,
      message_count: 1,
      first_message_at: new Date().toISOString(),
      last_message_at: new Date().toISOString(),
    });
    return {
      ipAddress,
      messageCount: 1,
      firstMessageAt: new Date().toISOString(),
      lastMessageAt: new Date().toISOString(),
      remaining: ANON_MESSAGE_LIMIT - 1,
      isLimited: false,
    };
  }

  const newCount = existing.message_count + 1;
  await db.from('rate_limits').update({
    message_count: newCount,
    last_message_at: new Date().toISOString(),
  }).eq('ip_address', ipAddress);

  return {
    ipAddress,
    messageCount: newCount,
    firstMessageAt: existing.first_message_at,
    lastMessageAt: new Date().toISOString(),
    remaining: Math.max(0, ANON_MESSAGE_LIMIT - newCount),
    isLimited: newCount >= ANON_MESSAGE_LIMIT,
  };
}
