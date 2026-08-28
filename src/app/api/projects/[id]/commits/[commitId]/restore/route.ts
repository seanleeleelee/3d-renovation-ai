import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canAccessProject, getGuestId } from "@/lib/access";
import { getProject, restoreCommit } from "@/lib/store";

type Ctx = { params: Promise<{ id: string; commitId: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id, commitId } = await ctx.params;
  const session = await auth();
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (
    !canAccessProject(project, {
      userId: session?.user?.id,
      guestId: getGuestId(req),
    })
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Login required" }, { status: 401 });
  }
  const updated = await restoreCommit(id, commitId);
  if (!updated) return NextResponse.json({ error: "Commit not found" }, { status: 404 });
  return NextResponse.json({ project: updated });
}
