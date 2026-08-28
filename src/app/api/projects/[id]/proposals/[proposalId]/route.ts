import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canAccessProject, getGuestId } from "@/lib/access";
import { getProject, saveProject } from "@/lib/store";

type Ctx = { params: Promise<{ id: string; proposalId: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id, proposalId } = await ctx.params;
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

  const body = (await req.json()) as { accept?: boolean };
  const proposal = project.scene.proposals.find((p) => p.id === proposalId);
  if (!proposal) {
    return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
  }

  if (body.accept) {
    proposal.status = "accepted";
    if (proposal.type === "remove_wall") {
      project.scene.walls = project.scene.walls.map((w) =>
        w.id === proposal.wallId ? { ...w, removed: true } : w,
      );
    }
  } else {
    proposal.status = "rejected";
  }

  await saveProject(project);
  return NextResponse.json({ project });
}
