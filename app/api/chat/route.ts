import { NextResponse } from "next/server";
import { createChat } from "@/db/queries/chats";

export async function POST() {
  const chat = createChat();
  return NextResponse.json(chat);
}
