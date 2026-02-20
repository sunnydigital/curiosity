import { NextRequest, NextResponse } from "next/server";
import { createChat } from "@/db/queries/chats";
import { getAuthContext } from "@/lib/auth/helpers";

export async function POST(request: NextRequest) {
  const auth = await getAuthContext(request);
  const chat = await createChat(undefined, auth.userId, auth.anonIp);
  return NextResponse.json(chat);
}
