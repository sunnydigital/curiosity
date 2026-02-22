import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  // Use the forwarded host (custom domain) rather than Vercel's internal URL
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto') ?? 'https';
  const host = forwardedHost ?? request.headers.get('host') ?? 'localhost:3000';
  const origin = `${forwardedProto}://${host}`;

  if (code) {
    // Build a redirect response FIRST, then attach cookies to it
    const redirectUrl = `${origin}${next}`;
    const response = NextResponse.redirect(redirectUrl);

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
            cookiesToSet.forEach(({ name, value, options }) => {
              response.cookies.set(name, value, options);
            });
          },
        },
      }
    );

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return response;
    }

    // Include error details in redirect for debugging
    const errMsg = encodeURIComponent(error.message || 'Unknown error');
    return NextResponse.redirect(`${origin}/auth/login?error=${errMsg}`);
  }

  return NextResponse.redirect(`${origin}/auth/login?error=No+code+provided`);
}
