import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { nanoid } from "nanoid";

export const GUEST_COOKIE = "reno_guest_id";

export function getGuestId(req: NextRequest): string | null {
  return req.cookies.get(GUEST_COOKIE)?.value ?? null;
}

export function ensureGuestId(
  req: NextRequest,
  res: NextResponse,
): string {
  const existing = getGuestId(req);
  if (existing) return existing;
  const id = nanoid(16);
  res.cookies.set(GUEST_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return id;
}

export function canAccessProject(
  project: { ownerId: string | null; guestId: string | null },
  opts: { userId?: string | null; guestId?: string | null },
): boolean {
  if (opts.userId && project.ownerId === opts.userId) return true;
  if (!project.ownerId && opts.guestId && project.guestId === opts.guestId)
    return true;
  if (!project.ownerId && !project.guestId) return true;
  return false;
}
