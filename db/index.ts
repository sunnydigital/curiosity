import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Service role client for server-side operations (bypasses RLS)
let serviceClient: SupabaseClient | null = null;

export function getDb(): SupabaseClient {
  if (serviceClient) return serviceClient;

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing Supabase environment variables');
  }

  serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  return serviceClient;
}
