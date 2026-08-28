"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { Job, Project, Proposal, Scene } from "@/types/scene";
import type { Selection } from "@/components/viewer/SceneViewer";

const SceneViewer = dynamic(
  () =>
    import("@/components/viewer/SceneViewer").then((m) => m.SceneViewer),
  { ssr: false, loading: () => <div className="flex h-full items-center justify-center text-sm text-white/70">Loading 3D…</div> },
);

type ChatMsg = {
  role: "user" | "assistant";
  content: string;
  imageUrls?: string[];
};

type PendingChatImage = {
  id: string;
  previewUrl: string;
  mimeType: string;
  base64: string;
};

export function ProjectWorkspace({
  initialProject,
  isLoggedIn,
}: {
  initialProject: Project;
  isLoggedIn: boolean;
}) {
  const [project, setProject] = useState(initialProject);
  const [selection, setSelection] = useState<Selection>(null);
  const [mode, setMode] = useState<"orbit" | "walk">("orbit");
  const [walkRoomId, setWalkRoomId] = useState<string | undefined>(
    initialProject.scene.rooms[0]?.id,
  );
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [chatImages, setChatImages] = useState<PendingChatImage[]>([]);
  const [busy, setBusy] = useState(false);
  const [commitName, setCommitName] = useState("");
  const [status, setStatus] = useState("");
  const [activeJob, setActiveJob] = useState<Job | null>(null);
  const [interrupt, setInterrupt] = useState<{
    reason: string;
    confidence: number;
  } | null>(null);

  const pendingProposals = useMemo(
    () => project.scene.proposals.filter((p) => p.status === "pending"),
    [project.scene.proposals],
  );

  const refreshProject = useCallback(async () => {
    const res = await fetch(`/api/projects/${project.id}`);
    if (!res.ok) return;
    const data = (await res.json()) as { project: Project };
    setProject(data.project);
  }, [project.id]);

  const autosave = useCallback(
    async (scene: Scene) => {
      setProject((p) => ({ ...p, scene }));
      await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scene }),
      });
    },
    [project.id],
  );

  useEffect(() => {
    if (!activeJob || activeJob.status === "completed" || activeJob.status === "failed")
      return;
    const t = setInterval(async () => {
      const res = await fetch(`/api/jobs/${activeJob.id}`);
      if (!res.ok) return;
      const data = (await res.json()) as { job: Job };
      setActiveJob(data.job);
      await refreshProject();
      if (data.job.status === "completed") {
        const needs = Boolean(data.job.result?.needsInterrupt);
        if (needs) {
          setInterrupt({
            reason: String(
              data.job.result?.interruptReason ?? data.job.message,
            ),
            confidence: Number(data.job.result?.confidence ?? 0),
          });
        }
        setStatus(data.job.message);
        if (data.job.notified) {
          setStatus((s) => `${s} · notified after long wait`);
        }
      } else if (data.job.status === "failed") {
        setStatus(
          data.job.error
            ? `Floorplan failed: ${data.job.error}`
            : "Floorplan job failed",
        );
      } else {
        setStatus(data.job.message);
      }
    }, 1500);
    return () => clearInterval(t);
  }, [activeJob, refreshProject]);

  async function onFloorplan(file: File) {
    setBusy(true);
    setStatus("Uploading floorplan…");
    setInterrupt(null);
    const body = new FormData();
    body.append("file", file);
    const res = await fetch(`/api/projects/${project.id}/floorplan`, {
      method: "POST",
      body,
    });
    setBusy(false);
    if (!res.ok) {
      setStatus("Floorplan upload failed");
      return;
    }
    const data = (await res.json()) as { job: Job };
    setActiveJob(data.job);
    setStatus(data.job.message);
  }

  async function onPhoto(file: File, roomId: string) {
    setBusy(true);
    setStatus("Uploading room photo…");
    const body = new FormData();
    body.append("file", file);
    body.append("roomId", roomId);
    const res = await fetch(`/api/projects/${project.id}/photo`, {
      method: "POST",
      body,
    });
    setBusy(false);
    if (!res.ok) {
      setStatus("Photo upload failed");
      return;
    }
    const data = (await res.json()) as { job: Job };
    setActiveJob(data.job);
    setStatus(data.job.message);
    setMode("walk");
    setWalkRoomId(roomId);
  }

  async function onChatImagesSelected(files: FileList | null) {
    if (!files?.length) return;
    const next: PendingChatImage[] = [];
    for (const file of Array.from(files).slice(0, 4 - chatImages.length)) {
      if (!file.type.startsWith("image/")) continue;
      if (file.size > 4_000_000) {
        setStatus("Image too large (max 4MB)");
        continue;
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const base64 = dataUrl.replace(/^data:[^;]+;base64,/, "");
      next.push({
        id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 7)}`,
        previewUrl: dataUrl,
        mimeType: file.type || "image/jpeg",
        base64,
      });
    }
    if (next.length) setChatImages((prev) => [...prev, ...next].slice(0, 4));
  }

  async function sendChat() {
    if (!chatInput.trim() && chatImages.length === 0) return;
    const message = chatInput.trim();
    const images = chatImages;
    setChatInput("");
    setChatImages([]);
    setChat((c) => [
      ...c,
      {
        role: "user",
        content: message || "(attached image)",
        imageUrls: images.map((i) => i.previewUrl),
      },
    ]);
    setBusy(true);
    const res = await fetch(`/api/projects/${project.id}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        history: chat.map(({ role, content }) => ({ role, content })),
        images: images.map((i) => ({
          mimeType: i.mimeType,
          base64: i.base64,
        })),
      }),
    });
    setBusy(false);
    if (!res.ok) {
      setChat((c) => [
        ...c,
        { role: "assistant", content: "Chat failed — check server logs / API key." },
      ]);
      return;
    }
    const data = (await res.json()) as {
      reply: string;
      project: Project;
    };
    setProject(data.project);
    setChat((c) => [...c, { role: "assistant", content: data.reply }]);
  }

  async function resolveProposal(proposal: Proposal, accept: boolean) {
    const res = await fetch(
      `/api/projects/${project.id}/proposals/${proposal.id}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accept }),
      },
    );
    if (!res.ok) return;
    const data = (await res.json()) as { project: Project };
    setProject(data.project);
  }

  async function removeSelectedWall() {
    if (selection?.type !== "wall") return;
    const scene: Scene = {
      ...project.scene,
      walls: project.scene.walls.map((w) =>
        w.id === selection.id ? { ...w, removed: true } : w,
      ),
    };
    await autosave(scene);
    setStatus(`Removed ${selection.id}`);
    setSelection(null);
  }

  async function commit() {
    if (!isLoggedIn) {
      setStatus("Log in to save & commit your work");
      window.location.href = `/login?next=/project/${project.id}`;
      return;
    }
    const name = commitName.trim() || `Checkpoint ${new Date().toLocaleString()}`;
    const res = await fetch(`/api/projects/${project.id}/commits`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      setStatus("Commit failed — login required to persist");
      return;
    }
    const data = (await res.json()) as { project: Project };
    setProject(data.project);
    setCommitName("");
    setStatus(`Committed: ${name}`);
  }

  async function restore(commitId: string) {
    const res = await fetch(
      `/api/projects/${project.id}/commits/${commitId}/restore`,
      { method: "POST" },
    );
    if (!res.ok) return;
    const data = (await res.json()) as { project: Project };
    setProject(data.project);
    setStatus("Restored commit");
  }

  async function confirmScale() {
    const scene = {
      ...project.scene,
      confidence: Math.max(project.scene.confidence, 0.75),
    };
    await autosave(scene);
    setInterrupt(null);
    setStatus("Scale confirmed — continuing with shell");
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-[#070a12] text-[#e8eef8]">
      <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div>
          <p className="font-[family-name:var(--font-display)] text-lg tracking-wide text-[#f4efe6]">
            OwnselfReno
          </p>
          <p className="text-xs text-white/55">{project.title}</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 ${mode === "orbit" ? "bg-white/15" : "bg-white/5"}`}
            onClick={() => setMode("orbit")}
          >
            Explore
          </button>
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 ${mode === "walk" ? "bg-white/15" : "bg-white/5"}`}
            onClick={() => setMode("walk")}
          >
            Walk
          </button>
          {!isLoggedIn ? (
            <a
              href={`/login?next=/project/${project.id}`}
              className="rounded-md bg-[#d97757] px-3 py-1.5 font-medium text-[#1a120e]"
            >
              Save / Login
            </a>
          ) : (
            <span className="rounded-md bg-emerald-500/20 px-2 py-1 text-emerald-200">
              Autosave on
            </span>
          )}
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <SceneViewer
          scene={project.scene}
          selection={selection}
          onSelect={(sel) => {
            setSelection(sel);
            if (sel?.type === "room") {
              setWalkRoomId(sel.id);
            }
          }}
          mode={mode}
          walkRoomId={walkRoomId}
          shellModelUrl={project.shellModelUrl}
        />

        <aside className="absolute inset-x-0 bottom-0 z-30 max-h-[46%] overflow-auto border-t border-white/10 bg-[#0b1020]/95 p-3 backdrop-blur md:inset-y-0 md:right-0 md:left-auto md:max-h-none md:w-[340px] md:border-l md:border-t-0">
          <div className="space-y-3 text-sm">
            {(status || activeJob) && (
              <div className="rounded-lg bg-white/5 p-2 text-xs text-white/80">
                <div className="flex items-center justify-between gap-2">
                  <span>{status || activeJob?.message}</span>
                  {activeJob && activeJob.status !== "completed" && activeJob.status !== "failed" && (
                    <span className="tabular-nums text-[#d97757]">
                      {activeJob.progress}%
                    </span>
                  )}
                </div>
                {activeJob && activeJob.status === "running" && (
                  <div className="mt-2 h-1 overflow-hidden rounded bg-white/10">
                    <div
                      className="h-full bg-[#d97757] transition-all"
                      style={{ width: `${activeJob.progress}%` }}
                    />
                  </div>
                )}
              </div>
            )}

            {interrupt && (
              <div className="rounded-lg border border-amber-400/40 bg-amber-400/10 p-3 text-xs">
                <p className="font-medium text-amber-100">Confidence check</p>
                <p className="mt-1 text-amber-50/80">{interrupt.reason}</p>
                <p className="mt-1 text-amber-50/60">
                  Confidence: {(interrupt.confidence * 100).toFixed(0)}%
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={confirmScale}
                    className="rounded-md bg-amber-300 px-2 py-1 text-[#1a120e]"
                  >
                    Confirm scale
                  </button>
                  <label className="cursor-pointer rounded-md bg-white/10 px-2 py-1">
                    Re-upload
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void onFloorplan(f);
                      }}
                    />
                  </label>
                </div>
              </div>
            )}

            <section>
              <h2 className="mb-1 text-xs uppercase tracking-wider text-white/45">
                Floorplan
              </h2>
              <label className="flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-white/20 px-3 py-3 text-xs hover:bg-white/5">
                Upload measured plan (JPG/PNG)
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  className="hidden"
                  disabled={busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void onFloorplan(f);
                  }}
                />
              </label>
            </section>

            <section>
              <h2 className="mb-1 text-xs uppercase tracking-wider text-white/45">
                Room photo
              </h2>
              <select
                className="mb-2 w-full rounded-md border border-white/10 bg-[#121a2a] px-2 py-1.5 text-xs"
                value={walkRoomId}
                onChange={(e) => setWalkRoomId(e.target.value)}
              >
                {project.scene.rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <label className="flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-white/20 px-3 py-3 text-xs hover:bg-white/5">
                Attach interior photo
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  className="hidden"
                  disabled={busy || !walkRoomId}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f && walkRoomId) void onPhoto(f, walkRoomId);
                  }}
                />
              </label>
            </section>

            {selection?.type === "wall" && (
              <section className="rounded-lg bg-white/5 p-2">
                <p className="text-xs text-white/70">Selected wall: {selection.id}</p>
                <button
                  type="button"
                  onClick={() => void removeSelectedWall()}
                  className="mt-2 rounded-md bg-rose-500/90 px-3 py-1.5 text-xs font-medium"
                >
                  Remove wall
                </button>
              </section>
            )}

            {pendingProposals.length > 0 && (
              <section>
                <h2 className="mb-1 text-xs uppercase tracking-wider text-white/45">
                  Confirm proposals
                </h2>
                <ul className="space-y-2">
                  {pendingProposals.map((p) => (
                    <li key={p.id} className="rounded-lg bg-white/5 p-2 text-xs">
                      <p className="font-medium">Remove {p.wallId}</p>
                      <p className="text-white/60">{p.reason}</p>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          className="rounded-md bg-emerald-500/90 px-2 py-1"
                          onClick={() => void resolveProposal(p, true)}
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          className="rounded-md bg-white/10 px-2 py-1"
                          onClick={() => void resolveProposal(p, false)}
                        >
                          Reject
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <div className="mb-1 flex items-center justify-between">
                <h2 className="text-xs uppercase tracking-wider text-white/45">
                  Chat editor
                </h2>
                <button
                  type="button"
                  className="text-xs text-[#d97757]"
                  onClick={() => setChatOpen((v) => !v)}
                >
                  {chatOpen ? "Hide" : "Open"}
                </button>
              </div>
              {chatOpen && (
                <div className="space-y-2">
                  <div className="max-h-40 space-y-2 overflow-auto rounded-md bg-black/20 p-2 text-xs">
                    {chat.length === 0 && (
                      <p className="text-white/40">
                        Try “paint walls warm white”, “place sofa…”, or attach a
                        room photo.
                      </p>
                    )}
                    {chat.map((m, i) => (
                      <div
                        key={`${m.role}-${i}`}
                        className={
                          m.role === "user" ? "text-[#f4efe6]" : "text-sky-200"
                        }
                      >
                        <p>
                          <span className="text-white/40">{m.role}: </span>
                          {m.content}
                        </p>
                        {m.imageUrls && m.imageUrls.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {m.imageUrls.map((url) => (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                key={url.slice(0, 48)}
                                src={url}
                                alt=""
                                className="h-14 w-14 rounded object-cover"
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {chatImages.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {chatImages.map((img) => (
                        <div key={img.id} className="relative">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={img.previewUrl}
                            alt=""
                            className="h-14 w-14 rounded object-cover"
                          />
                          <button
                            type="button"
                            className="absolute -right-1 -top-1 rounded-full bg-black/80 px-1 text-[10px] text-white"
                            onClick={() =>
                              setChatImages((prev) =>
                                prev.filter((p) => p.id !== img.id),
                              )
                            }
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <label className="flex cursor-pointer items-center rounded-md border border-white/10 bg-[#121a2a] px-2 py-1.5 text-xs text-white/70 hover:bg-white/5">
                      Photo
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          void onChatImagesSelected(e.target.files);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    <input
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void sendChat();
                      }}
                      placeholder="Tell AI what to change…"
                      className="flex-1 rounded-md border border-white/10 bg-[#121a2a] px-2 py-1.5 text-xs"
                    />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void sendChat()}
                      className="rounded-md bg-[#d97757] px-3 py-1.5 text-xs font-medium text-[#1a120e] disabled:opacity-50"
                    >
                      Send
                    </button>
                  </div>
                </div>
              )}
            </section>

            <section>
              <h2 className="mb-1 text-xs uppercase tracking-wider text-white/45">
                Save / commit
              </h2>
              <div className="flex gap-2">
                <input
                  value={commitName}
                  onChange={(e) => setCommitName(e.target.value)}
                  placeholder="before knocking wall"
                  className="flex-1 rounded-md border border-white/10 bg-[#121a2a] px-2 py-1.5 text-xs"
                />
                <button
                  type="button"
                  onClick={() => void commit()}
                  className="rounded-md bg-white/15 px-3 py-1.5 text-xs"
                >
                  Commit
                </button>
              </div>
              <ul className="mt-2 max-h-28 space-y-1 overflow-auto text-xs">
                {project.commits.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-2 rounded bg-white/5 px-2 py-1"
                  >
                    <span className="truncate">{c.name}</span>
                    <button
                      type="button"
                      className="shrink-0 text-[#d97757]"
                      onClick={() => void restore(c.id)}
                    >
                      Restore
                    </button>
                  </li>
                ))}
                {project.commits.length === 0 && (
                  <li className="text-white/40">No commits yet</li>
                )}
              </ul>
            </section>
          </div>
        </aside>
      </div>
    </div>
  );
}
