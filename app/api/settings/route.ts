import { NextRequest, NextResponse } from "next/server";
import { getSettings, updateSettings } from "@/db/queries/settings";

export async function GET() {
  try {
    const settings = getSettings();
    // Mask API keys for frontend display
    return NextResponse.json({
      ...settings,
      openaiApiKey: settings.openaiApiKey ? "••••••••" : null,
      anthropicApiKey: settings.anthropicApiKey ? "••••••••" : null,
      geminiApiKey: settings.geminiApiKey ? "••••••••" : null,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    updateSettings(body);
    const settings = getSettings();
    return NextResponse.json({
      ...settings,
      openaiApiKey: settings.openaiApiKey ? "••••••••" : null,
      anthropicApiKey: settings.anthropicApiKey ? "••••••••" : null,
      geminiApiKey: settings.geminiApiKey ? "••••••••" : null,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
