import { createClient } from '@/lib/supabase/server';
import { NextRequest } from 'next/server';

export interface AuthContext {
  userId: string | null;
  email: string | null;
  isAdmin: boolean;
  anonId: string | null;
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
        anonId: null,
      };
    }
  } catch {
    // Not authenticated
  }

  // Anonymous user — use session cookie for isolation
  const anonId = request?.cookies.get('curiosity-anon-id')?.value || null;

  return {
    userId: null,
    email: null,
    isAdmin: false,
    anonId,
  };
}
