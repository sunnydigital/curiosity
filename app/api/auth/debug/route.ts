import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const allCookies = cookieStore.getAll();
  
  // Check what Supabase sees
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() {},
      },
    }
  );

  const { data: { user }, error } = await supabase.auth.getUser();

  return NextResponse.json({
    cookieNames: allCookies.map(c => c.name),
    cookieCount: allCookies.length,
    supabaseCookies: allCookies.filter(c => c.name.startsWith('sb-')).map(c => ({ name: c.name, valueLength: c.value.length })),
    user: user ? { id: user.id, email: user.email } : null,
    error: error?.message || null,
  });
}
