import { NextRequest, NextResponse } from "next/server";
import { listChats, deleteAllChats } from "@/db/queries/chats";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q") || undefined;
  const chats = listChats(query);
  return NextResponse.json(chats);
}

export async function DELETE() {
  deleteAllChats();
  return NextResponse.json({ success: true });
}
