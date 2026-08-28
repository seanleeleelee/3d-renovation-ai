import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getGuestId } from "@/lib/access";
import { claimProject } from "@/lib/store";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Login required" }, { status: 401 });
  }
  const { id } = await ctx.params;
  try {
    const project = await claimProject(id, session.user.id, getGuestId(req));
    if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ project });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Claim failed" },
      { status: 403 },
    );
  }
}
