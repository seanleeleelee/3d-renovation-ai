import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canAccessProject, getGuestId } from "@/lib/access";
import { createCommit, getProject, saveProject } from "@/lib/store";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const session = await auth();
  if (
    !canAccessProject(project, {
      userId: session?.user?.id,
      guestId: getGuestId(req),
    })
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ commits: project.commits });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Login required to commit / persist" },
      { status: 401 },
    );
  }
  const { id } = await ctx.params;
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (
    !canAccessProject(project, {
      userId: session.user.id,
      guestId: getGuestId(req),
    })
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!project.ownerId) {
    project.ownerId = session.user.id;
    await saveProject(project);
  }
  const body = (await req.json()) as { name?: string };
  const commit = await createCommit(id, body.name ?? "Checkpoint");
  const updated = await getProject(id);
  return NextResponse.json({ commit, project: updated });
}
