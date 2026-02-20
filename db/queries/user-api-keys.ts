import { getDb } from "@/db";
import type { LLMProviderName } from "@/types";

export async function getUserApiKey(userId: string, provider: LLMProviderName): Promise<string | null> {
  const db = getDb();
  const { data, error } = await db
    .from('user_api_keys')
    .select('api_key')
    .eq('user_id', userId)
    .eq('provider', provider)
    .single();

  if (error || !data) return null;
  return data.api_key;
}

export async function getUserApiKeys(userId: string): Promise<Record<string, string>> {
  const db = getDb();
  const { data, error } = await db
    .from('user_api_keys')
    .select('provider, api_key')
    .eq('user_id', userId);

  if (error || !data) return {};
  const keys: Record<string, string> = {};
  for (const row of data) {
    keys[row.provider] = row.api_key;
  }
  return keys;
}

export async function setUserApiKey(userId: string, provider: LLMProviderName, apiKey: string): Promise<void> {
  const db = getDb();
  await db
    .from('user_api_keys')
    .upsert({
      user_id: userId,
      provider,
      api_key: apiKey,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,provider' });
}

export async function deleteUserApiKey(userId: string, provider: LLMProviderName): Promise<void> {
  const db = getDb();
  await db
    .from('user_api_keys')
    .delete()
    .eq('user_id', userId)
    .eq('provider', provider);
}
