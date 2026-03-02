import { NextRequest, NextResponse } from "next/server";
import { listChats, deleteAllChats } from "@/db/queries/chats";
import { getAuthContext } from "@/lib/auth/helpers";

export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);
  const query = request.nextUrl.searchParams.get("q") || undefined;
  const chats = await listChats(auth.userId, auth.anonId, query);
  return NextResponse.json(chats);
}

export async function DELETE(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (auth.userId) {
    await deleteAllChats(auth.userId);
  }
  return NextResponse.json({ success: true });
}
