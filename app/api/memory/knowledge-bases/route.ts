import { NextRequest, NextResponse } from "next/server";
import {
  listKnowledgeBases,
  createKnowledgeBase,
} from "@/db/queries/knowledge-bases";

export async function GET() {
  const kbs = listKnowledgeBases();
  return NextResponse.json(kbs);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const kb = createKnowledgeBase(body.name, body.description);
  return NextResponse.json(kb);
}
