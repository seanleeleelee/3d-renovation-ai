import { NextResponse } from "next/server";
import { createJob } from "@/lib/store";

/** Prototype in-app / log notification when long jobs finish. */
export async function POST(req: Request) {
  const body = (await req.json()) as {
    projectId?: string;
    message?: string;
    email?: string;
  };
  if (!body.projectId || !body.message) {
    return NextResponse.json({ error: "projectId and message required" }, { status: 400 });
  }
  console.info(`[notify] project=${body.projectId} email=${body.email ?? "-"} ${body.message}`);
  const job = await createJob({
    projectId: body.projectId,
    type: "notify",
    message: body.message,
    notifyAfterMs: 0,
    status: "completed",
    progress: 100,
    result: { email: body.email ?? null, channel: "log" },
  });
  return NextResponse.json({ ok: true, job });
}
