import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth/helpers';
import { checkRateLimit } from '@/db/queries/rate-limits';

export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);

  if (auth.userId) {
    return NextResponse.json({
      authenticated: true,
      userId: auth.userId,
      email: auth.email,
      isAdmin: auth.isAdmin,
    });
  }

  // Anonymous — include rate limit info
  const rateLimit = await checkRateLimit(auth.anonId || 'unknown');
  return NextResponse.json({
    authenticated: false,
    rateLimit: {
      remaining: rateLimit.remaining,
      total: 20,
      isLimited: rateLimit.isLimited,
    },
  });
}
