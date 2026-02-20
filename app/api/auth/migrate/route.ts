import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth/helpers';
import { migrateAnonChatsToUser } from '@/db/queries/chats';

export async function POST(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth.userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // Get the IP to find anonymous chats
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || '127.0.0.1';

  const migrated = await migrateAnonChatsToUser(ip, auth.userId);
  return NextResponse.json({ migrated });
}
