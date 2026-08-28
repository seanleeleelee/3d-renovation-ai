import { NextResponse } from "next/server";
import { saveOtp } from "@/lib/store";

export async function POST(req: Request) {
  const body = (await req.json()) as { email?: string };
  const email = String(body.email ?? "").toLowerCase().trim();
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }
  const code = String(Math.floor(100000 + Math.random() * 900000));
  await saveOtp(email, code);

  // Prototype: return code in response + log (no email provider wired).
  console.info(`[otp] ${email} => ${code}`);
  return NextResponse.json({
    ok: true,
    message: "OTP generated. Check server logs in development.",
    ...(process.env.NODE_ENV !== "production" ? { devCode: code } : {}),
  });
}
