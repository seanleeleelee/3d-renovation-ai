import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canAccessProject, getGuestId } from "@/lib/access";
import { getProject } from "@/lib/store";
import { enqueuePhotoDressJob } from "@/lib/jobs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
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

  const form = await req.formData();
  const file = form.get("file");
  const roomId = String(form.get("roomId") ?? "");
  if (!(file instanceof File) || !roomId) {
    return NextResponse.json({ error: "file and roomId required" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Images only" }, { status: 400 });
  }
  if (!project.scene.rooms.some((r) => r.id === roomId)) {
    return NextResponse.json({ error: "Unknown room" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const job = await enqueuePhotoDressJob({
    projectId: id,
    roomId,
    filename: file.name,
    buffer,
    mimeType: file.type || "image/jpeg",
  });
  return NextResponse.json({ job });
}
