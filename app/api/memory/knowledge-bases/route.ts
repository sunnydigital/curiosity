import { NextRequest, NextResponse } from "next/server";
import { listKnowledgeBases, createKnowledgeBase } from "@/db/queries/knowledge-bases";
import { getAuthContext } from "@/lib/auth/helpers";

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    const kbs = await listKnowledgeBases(auth.userId);
    return NextResponse.json(kbs);
  } catch (error: any) {
    console.error("Failed to list knowledge bases:", error);
    return NextResponse.json({ error: error.message || "Failed to list knowledge bases" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    const body = await request.json();
    const kb = await createKnowledgeBase(body.name, body.description, auth.userId);
    return NextResponse.json(kb);
  } catch (error: any) {
    console.error("Failed to create knowledge base:", error);
    return NextResponse.json({ error: error.message || "Failed to create knowledge base" }, { status: 500 });
  }
}
