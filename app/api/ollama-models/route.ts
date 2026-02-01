import { NextResponse } from "next/server";
import { getSettings } from "@/db/queries/settings";

export async function GET() {
  try {
    const settings = getSettings();
    const baseUrl = settings.ollamaBaseUrl.replace(/\/$/, "");
    const res = await fetch(`${baseUrl}/api/tags`);
    if (!res.ok) return NextResponse.json({ models: [] });
    const data = await res.json();
    const models: string[] = (data.models || []).map((m: any) => m.name);
    return NextResponse.json({ models });
  } catch {
    return NextResponse.json({ models: [] });
  }
}
