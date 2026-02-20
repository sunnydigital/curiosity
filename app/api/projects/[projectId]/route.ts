import { NextRequest, NextResponse } from "next/server";
import { getProject, renameProject, deleteProject } from "@/db/queries/projects";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const project = await getProject(projectId);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  return NextResponse.json(project);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const body = await request.json();
  if (body.title !== undefined) {
    await renameProject(projectId, body.title);
  }
  const project = await getProject(projectId);
  return NextResponse.json(project);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  await deleteProject(projectId);
  return NextResponse.json({ success: true });
}
