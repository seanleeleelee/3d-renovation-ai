"use client";

import { FormEvent, useMemo, useState } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";

export default function LoginClient() {
  const params = useSearchParams();
  const next = useMemo(() => params.get("next") ?? "/", [params]);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [step, setStep] = useState<"email" | "code">("email");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const googleEnabled = process.env.NEXT_PUBLIC_GOOGLE_AUTH === "1";

  async function requestOtp(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setStatus("");
    const res = await fetch("/api/auth/otp/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setLoading(false);
    if (!res.ok) {
      setStatus("Could not send code");
      return;
    }
    const data = (await res.json()) as { devCode?: string };
    if (data.devCode) setDevCode(data.devCode);
    setStep("code");
    setStatus("Enter the 6-digit code (shown below in development).");
  }

  async function verifyOtp(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    const result = await signIn("otp", {
      email,
      code,
      redirect: false,
    });
    setLoading(false);
    if (result?.error) {
      setStatus("Invalid code");
      return;
    }
    const match = next.match(/\/project\/([^/?#]+)/);
    if (match?.[1]) {
      await fetch(`/api/projects/${match[1]}/claim`, { method: "POST" });
    }
    window.location.href = next;
  }

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center px-6">
      <a href="/" className="font-[family-name:var(--font-display)] text-3xl text-[#f4efe6]">
        OwnselfReno
      </a>
      <h1 className="mt-4 text-xl text-white/90">Log in to save & commit</h1>
      <p className="mt-2 text-sm text-white/55">
        Guests can explore. Login persists drafts and named checkpoints.
      </p>

      {googleEnabled && (
        <button
          type="button"
          className="mt-6 rounded-lg border border-white/15 px-4 py-3 text-sm hover:bg-white/5"
          onClick={() => void signIn("google", { callbackUrl: next })}
        >
          Continue with Google
        </button>
      )}

      {step === "email" ? (
        <form onSubmit={requestOtp} className="mt-6 space-y-3">
          <label className="block text-xs text-white/50">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-[#121a2a] px-3 py-2 text-sm"
            placeholder="you@example.com"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-[#d97757] px-4 py-3 text-sm font-semibold text-[#1a120e]"
          >
            {loading ? "Sending…" : "Email me a code"}
          </button>
        </form>
      ) : (
        <form onSubmit={verifyOtp} className="mt-6 space-y-3">
          <label className="block text-xs text-white/50">One-time code</label>
          <input
            inputMode="numeric"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-[#121a2a] px-3 py-2 text-sm tracking-[0.3em]"
            placeholder="123456"
          />
          {devCode && (
            <p className="rounded-md bg-white/5 px-3 py-2 text-xs text-emerald-200">
              Dev code: <strong>{devCode}</strong>
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-[#d97757] px-4 py-3 text-sm font-semibold text-[#1a120e]"
          >
            {loading ? "Verifying…" : "Verify & continue"}
          </button>
          <button
            type="button"
            className="w-full text-xs text-white/50"
            onClick={() => setStep("email")}
          >
            Use a different email
          </button>
        </form>
      )}

      {status && <p className="mt-4 text-sm text-white/60">{status}</p>}
    </main>
  );
}
