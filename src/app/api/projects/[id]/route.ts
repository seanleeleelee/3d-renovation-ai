import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canAccessProject, getGuestId } from "@/lib/access";
import { getProject, saveProject, updateScene } from "@/lib/store";
import type { Scene } from "@/types/scene";

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
  return NextResponse.json({ project });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
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

  const body = (await req.json()) as {
    scene?: Scene;
    title?: string;
    confidence?: number;
  };

  if (body.title) project.title = body.title;
  if (body.scene) {
    const updated = await updateScene(id, body.scene);
    return NextResponse.json({ project: updated });
  }
  await saveProject(project);
  return NextResponse.json({ project });
}
