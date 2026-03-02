import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

const ANON_COOKIE = 'curiosity-anon-id';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session if expired
  await supabase.auth.getUser();

  // Ensure anonymous session cookie exists
  if (!request.cookies.get(ANON_COOKIE)?.value) {
    const anonId = uuidv4();
    supabaseResponse.cookies.set(ANON_COOKIE, anonId, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 365 * 24 * 60 * 60, // 1 year
    });
  }

  return supabaseResponse;
}
