import { NextRequest, NextResponse } from "next/server";
import { listProjects, createProject } from "@/db/queries/projects";

export async function GET() {
  const projects = listProjects();
  return NextResponse.json(projects);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { title, icon } = body;
  if (!title || typeof title !== "string") {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }
  const project = createProject(title, icon);
  return NextResponse.json(project);
}
