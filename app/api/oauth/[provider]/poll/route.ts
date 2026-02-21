import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/oauth/{provider}/poll?sessionId=...
 *
 * In the serverless-compatible OAuth flow, there is no local callback server
 * to poll. The user always pastes the code manually via the exchange endpoint.
 * This endpoint exists for backward compatibility — it always returns "pending".
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const sessionId = request.nextUrl.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
  }

  // Always return pending — exchange endpoint handles completion
  return NextResponse.json({ status: "pending" });
}
