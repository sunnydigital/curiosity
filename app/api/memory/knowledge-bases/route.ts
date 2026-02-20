import { NextRequest, NextResponse } from "next/server";
import { listKnowledgeBases, createKnowledgeBase } from "@/db/queries/knowledge-bases";
import { getAuthContext } from "@/lib/auth/helpers";

export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);
  const kbs = await listKnowledgeBases(auth.userId);
  return NextResponse.json(kbs);
}

export async function POST(request: NextRequest) {
  const auth = await getAuthContext(request);
  const body = await request.json();
  const kb = await createKnowledgeBase(body.name, body.description, auth.userId);
  return NextResponse.json(kb);
}
