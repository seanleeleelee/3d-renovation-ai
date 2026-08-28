import { promises as fs } from "fs";
import path from "path";
import { nanoid } from "nanoid";
import type { Job, Project, ProjectCommit, Scene } from "@/types/scene";
import { createMockScene } from "@/lib/scene";

const DATA_DIR = path.join(process.cwd(), ".data");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");

async function ensureDirs() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  await fs.mkdir(path.join(DATA_DIR, "projects"), { recursive: true });
  await fs.mkdir(path.join(DATA_DIR, "jobs"), { recursive: true });
  await fs.mkdir(path.join(DATA_DIR, "otp"), { recursive: true });
}

function projectPath(id: string) {
  return path.join(DATA_DIR, "projects", `${id}.json`);
}

function jobPath(id: string) {
  return path.join(DATA_DIR, "jobs", `${id}.json`);
}

export async function createProject(opts: {
  guestId?: string | null;
  ownerId?: string | null;
  title?: string;
  scene?: Scene;
}): Promise<Project> {
  await ensureDirs();
  const now = new Date().toISOString();
  const project: Project = {
    id: nanoid(12),
    title: opts.title ?? "My renovation",
    ownerId: opts.ownerId ?? null,
    guestId: opts.guestId ?? null,
    scene: opts.scene ?? createMockScene(),
    draftUpdatedAt: now,
    createdAt: now,
    commits: [],
    roomPhotos: [],
    jobs: [],
  };
  await fs.writeFile(projectPath(project.id), JSON.stringify(project, null, 2));
  return project;
}

export async function getProject(id: string): Promise<Project | null> {
  await ensureDirs();
  try {
    const raw = await fs.readFile(projectPath(id), "utf8");
    return JSON.parse(raw) as Project;
  } catch {
    return null;
  }
}

export async function saveProject(project: Project): Promise<Project> {
  await ensureDirs();
  project.draftUpdatedAt = new Date().toISOString();
  await fs.writeFile(projectPath(project.id), JSON.stringify(project, null, 2));
  return project;
}

export async function listProjectsForUser(opts: {
  ownerId?: string | null;
  guestId?: string | null;
}): Promise<Project[]> {
  await ensureDirs();
  const files = await fs.readdir(path.join(DATA_DIR, "projects"));
  const projects: Project[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const raw = await fs.readFile(path.join(DATA_DIR, "projects", file), "utf8");
    const p = JSON.parse(raw) as Project;
    if (opts.ownerId && p.ownerId === opts.ownerId) projects.push(p);
    else if (opts.guestId && p.guestId === opts.guestId && !p.ownerId)
      projects.push(p);
  }
  return projects.sort((a, b) => b.draftUpdatedAt.localeCompare(a.draftUpdatedAt));
}

export async function claimProject(
  projectId: string,
  ownerId: string,
  guestId?: string | null,
): Promise<Project | null> {
  const project = await getProject(projectId);
  if (!project) return null;
  if (project.ownerId && project.ownerId !== ownerId) {
    throw new Error("Project already owned by another user");
  }
  if (guestId && project.guestId && project.guestId !== guestId) {
    throw new Error("Guest session mismatch");
  }
  project.ownerId = ownerId;
  return saveProject(project);
}

export async function updateScene(
  projectId: string,
  scene: Scene,
): Promise<Project | null> {
  const project = await getProject(projectId);
  if (!project) return null;
  project.scene = scene;
  return saveProject(project);
}

export async function createCommit(
  projectId: string,
  name: string,
): Promise<ProjectCommit | null> {
  const project = await getProject(projectId);
  if (!project) return null;
  const commit: ProjectCommit = {
    id: nanoid(10),
    name,
    createdAt: new Date().toISOString(),
    scene: structuredClone(project.scene),
  };
  project.commits.unshift(commit);
  await saveProject(project);
  return commit;
}

export async function restoreCommit(
  projectId: string,
  commitId: string,
): Promise<Project | null> {
  const project = await getProject(projectId);
  if (!project) return null;
  const commit = project.commits.find((c) => c.id === commitId);
  if (!commit) return null;
  project.scene = structuredClone(commit.scene);
  return saveProject(project);
}

export async function createJob(
  partial: Omit<Job, "id" | "createdAt" | "updatedAt" | "progress" | "status"> & {
    status?: Job["status"];
    progress?: number;
  },
): Promise<Job> {
  await ensureDirs();
  const now = new Date().toISOString();
  const job: Job = {
    id: nanoid(12),
    status: partial.status ?? "queued",
    progress: partial.progress ?? 0,
    createdAt: now,
    updatedAt: now,
    notifyAfterMs: partial.notifyAfterMs,
    projectId: partial.projectId,
    type: partial.type,
    message: partial.message,
    result: partial.result,
    error: partial.error,
    notified: false,
  };
  await fs.writeFile(jobPath(job.id), JSON.stringify(job, null, 2));
  const project = await getProject(job.projectId);
  if (project) {
    project.jobs.unshift(job.id);
    await saveProject(project);
  }
  return job;
}

export async function getJob(id: string): Promise<Job | null> {
  await ensureDirs();
  try {
    const raw = await fs.readFile(jobPath(id), "utf8");
    return JSON.parse(raw) as Job;
  } catch {
    return null;
  }
}

export async function saveJob(job: Job): Promise<Job> {
  await ensureDirs();
  job.updatedAt = new Date().toISOString();
  await fs.writeFile(jobPath(job.id), JSON.stringify(job, null, 2));
  return job;
}

export async function saveUpload(
  filename: string,
  data: Buffer,
): Promise<string> {
  await ensureDirs();
  const safe = `${nanoid(8)}-${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const full = path.join(UPLOADS_DIR, safe);
  await fs.writeFile(full, data);
  return safe;
}

export function uploadAbsolutePath(relative: string) {
  return path.join(UPLOADS_DIR, relative);
}

export async function saveOtp(email: string, code: string) {
  await ensureDirs();
  await fs.writeFile(
    path.join(DATA_DIR, "otp", `${email.replace(/[^a-z0-9@._-]/gi, "_")}.json`),
    JSON.stringify({ code, expiresAt: Date.now() + 10 * 60 * 1000 }),
  );
}

export async function verifyOtp(email: string, code: string): Promise<boolean> {
  await ensureDirs();
  try {
    const raw = await fs.readFile(
      path.join(DATA_DIR, "otp", `${email.replace(/[^a-z0-9@._-]/gi, "_")}.json`),
      "utf8",
    );
    const data = JSON.parse(raw) as { code: string; expiresAt: number };
    if (Date.now() > data.expiresAt) return false;
    return data.code === code;
  } catch {
    return false;
  }
}
