"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function startGuest() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "My renovation" }),
      });
      if (!res.ok) throw new Error("Could not create project");
      const data = (await res.json()) as { project: { id: string } };
      router.push(`/project/${data.project.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setLoading(false);
    }
  }

  return (
    <main className="relative min-h-[100dvh] overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_0%,_#2a3a55_0%,_transparent_50%),radial-gradient(ellipse_at_90%_20%,_#3d2a22_0%,_transparent_40%),linear-gradient(180deg,#0b1020_0%,#070a12_100%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.12] [background-image:linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:48px_48px]" />

      <div className="relative mx-auto flex min-h-[100dvh] max-w-lg flex-col justify-end px-6 pb-16 pt-24 md:justify-center">
        <p className="font-[family-name:var(--font-display)] text-5xl leading-none tracking-tight text-[#f4efe6] md:text-6xl">
          OwnselfReno
        </p>
        <h1 className="mt-5 max-w-md text-xl font-medium text-white/90 md:text-2xl">
          Turn a measured floorplan into an editable 3D house.
        </h1>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-white/60">
          Orbit the blank shell, walk into rooms, dress them from photos, and chat
          to change materials, furniture, or propose wall removals — then save and
          commit your renovation.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            type="button"
            disabled={loading}
            onClick={() => void startGuest()}
            className="rounded-lg bg-[#d97757] px-5 py-3 text-sm font-semibold text-[#1a120e] shadow-[0_10px_40px_rgba(217,119,87,0.25)] disabled:opacity-60"
          >
            {loading ? "Starting…" : "Try as guest"}
          </button>
          <a
            href="/login"
            className="rounded-lg border border-white/15 px-5 py-3 text-center text-sm text-white/80 hover:bg-white/5"
          >
            Log in to save
          </a>
        </div>
        {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}
      </div>
    </main>
  );
}
