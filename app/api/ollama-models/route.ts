import { NextResponse } from "next/server";

// Ollama detection now happens client-side via the useOllama hook.
// The server (Vercel) cannot reach localhost:11434.
// This endpoint returns an empty list with a flag for backwards compatibility.
export async function GET() {
  return NextResponse.json({
    models: [],
    clientSideDetection: true,
  });
}
