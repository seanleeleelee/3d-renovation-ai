import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canAccessProject, getGuestId } from "@/lib/access";
import { getProject } from "@/lib/store";
import { enqueueFloorplanJob } from "@/lib/jobs";

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
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Images only (JPG/PNG)" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const job = await enqueueFloorplanJob({
    projectId: id,
    filename: file.name,
    buffer,
    mimeType: file.type || "image/png",
  });
  return NextResponse.json({ job });
}
