import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  // Use the forwarded host (custom domain) rather than Vercel's internal URL
  const forwardedHost = request.headers.get('x-forwarded-host');
  const isLocalEnv = process.env.NODE_ENV === 'development';
  const { origin } = new URL(request.url);

  function getRedirectUrl(path: string) {
    if (isLocalEnv) return `${origin}${path}`;
    if (forwardedHost) {
      // Always redirect to www subdomain in production
      const host = forwardedHost.replace(/^(?!www\.)(.+\.curiosityllm\.app)$/, 'www.$1');
      return `https://${host}${path}`;
    }
    return `${origin}${path}`;
  }

  if (code) {
    // Collect cookies to set on the final response
    const cookiesToSet: { name: string; value: string; options?: any }[] = [];

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookies: { name: string; value: string; options?: any }[]) {
            cookiesToSet.push(...cookies);
          },
        },
      }
    );

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const response = NextResponse.redirect(getRedirectUrl(next));
      // Apply all collected cookies to the redirect response
      for (const { name, value, options } of cookiesToSet) {
        response.cookies.set(name, value, {
          ...options,
          path: '/',
        });
      }
      return response;
    }

    const errMsg = encodeURIComponent(error.message || 'Unknown error');
    return NextResponse.redirect(getRedirectUrl(`/auth/login?error=${errMsg}`));
  }

  return NextResponse.redirect(getRedirectUrl('/auth/login?error=No+code+provided'));
}
