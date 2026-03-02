import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth/helpers';
import { migrateAnonChatsToUser } from '@/db/queries/chats';

export async function POST(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth.userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // Get the anon cookie to find anonymous chats to migrate
  const anonId = request.cookies.get('curiosity-anon-id')?.value;
  if (!anonId) {
    return NextResponse.json({ migrated: 0 });
  }

  const migrated = await migrateAnonChatsToUser(anonId, auth.userId);
  return NextResponse.json({ migrated });
}
