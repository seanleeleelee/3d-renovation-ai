import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ensureGuestId } from "@/lib/access";
import { createProject, listProjectsForUser } from "@/lib/store";

export async function GET(req: NextRequest) {
  const session = await auth();
  const res = NextResponse.next();
  const guestId = ensureGuestId(req, res);
  const projects = await listProjectsForUser({
    ownerId: session?.user?.id,
    guestId: session?.user?.id ? null : guestId,
  });
  const json = NextResponse.json({ projects });
  const cookie = res.cookies.get("reno_guest_id");
  if (cookie) json.cookies.set(cookie);
  return json;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const shell = NextResponse.next();
  const guestId = ensureGuestId(req, shell);
  const body = (await req.json().catch(() => ({}))) as { title?: string; mock?: boolean };

  const project = await createProject({
    ownerId: session?.user?.id ?? null,
    guestId: session?.user?.id ? null : guestId,
    title: body.title,
  });

  const json = NextResponse.json({ project });
  const cookie = shell.cookies.get("reno_guest_id");
  if (cookie) json.cookies.set(cookie);
  return json;
}
