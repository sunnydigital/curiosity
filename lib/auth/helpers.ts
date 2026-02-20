import { createClient } from '@/lib/supabase/server';
import { NextRequest } from 'next/server';

export interface AuthContext {
  userId: string | null;
  email: string | null;
  isAdmin: boolean;
  anonIp: string | null;
}

const ADMIN_EMAIL = 'sunnys2327@gmail.com';

export async function getAuthContext(request?: NextRequest): Promise<AuthContext> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      return {
        userId: user.id,
        email: user.email || null,
        isAdmin: user.email === ADMIN_EMAIL,
        anonIp: null,
      };
    }
  } catch {
    // Not authenticated
  }

  // Anonymous user — get IP
  const ip = request?.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request?.headers.get('x-real-ip')
    || '127.0.0.1';

  return {
    userId: null,
    email: null,
    isAdmin: false,
    anonIp: ip,
  };
}
