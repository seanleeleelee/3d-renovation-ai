import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canAccessProject, getGuestId } from "@/lib/access";
import { getProject, saveProject } from "@/lib/store";
import {
  runChatEditor,
  type ChatImage,
  type ChatTurn,
} from "@/lib/chat-tools";

type Ctx = { params: Promise<{ id: string }> };

const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 4_000_000; // ~4MB decoded estimate via base64 length

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

  const body = (await req.json()) as {
    message?: string;
    history?: ChatTurn[];
    images?: { mimeType?: string; base64?: string }[];
  };

  const message = body.message?.trim() ?? "";
  const images: ChatImage[] = [];
  for (const img of body.images ?? []) {
    if (images.length >= MAX_IMAGES) break;
    const mimeType = img.mimeType?.trim() || "image/jpeg";
    if (!mimeType.startsWith("image/")) continue;
    const base64 = (img.base64 ?? "").replace(/^data:[^;]+;base64,/, "");
    if (!base64) continue;
    if (base64.length * 0.75 > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: "Image too large (max ~4MB each)" },
        { status: 400 },
      );
    }
    images.push({ mimeType, base64 });
  }

  if (!message && images.length === 0) {
    return NextResponse.json(
      { error: "message or images required" },
      { status: 400 },
    );
  }

  const result = await runChatEditor({
    scene: project.scene,
    message,
    history: body.history,
    images,
  });
  project.scene = result.scene;
  await saveProject(project);
  return NextResponse.json({
    reply: result.reply,
    proposals: result.proposals,
    project,
  });
}
