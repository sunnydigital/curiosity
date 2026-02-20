import { NextRequest, NextResponse } from "next/server";
import { listProjects, createProject } from "@/db/queries/projects";
import { getAuthContext } from "@/lib/auth/helpers";

export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);
  const projects = await listProjects(auth.userId);
  return NextResponse.json(projects);
}

export async function POST(request: NextRequest) {
  const auth = await getAuthContext(request);
  const body = await request.json();
  const { title, icon } = body;
  if (!title || typeof title !== "string") {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }
  const project = await createProject(title, icon, auth.userId);
  return NextResponse.json(project);
}
