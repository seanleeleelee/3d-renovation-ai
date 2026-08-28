import {
  createJob,
  getJob,
  getProject,
  saveJob,
  saveProject,
  saveUpload,
  uploadAbsolutePath,
} from "@/lib/store";
import { extractFloorplanFromImage } from "@/lib/floorplan";
import { dressRoomFromPhoto } from "@/lib/photo-dress";
import { promises as fs } from "fs";
import type { Job } from "@/types/scene";

const NOTIFY_THRESHOLD_MS = Number(process.env.JOB_NOTIFY_MS ?? 30_000);

export async function enqueueFloorplanJob(opts: {
  projectId: string;
  filename: string;
  buffer: Buffer;
  mimeType: string;
}): Promise<Job> {
  const relative = await saveUpload(opts.filename, opts.buffer);
  const project = await getProject(opts.projectId);
  if (!project) throw new Error("Project not found");
  project.floorplanPath = relative;
  await saveProject(project);

  const job = await createJob({
    projectId: opts.projectId,
    type: "floorplan_extract",
    message: "Extracting walls and rooms from floorplan…",
    notifyAfterMs: NOTIFY_THRESHOLD_MS,
    result: { path: relative, mimeType: opts.mimeType },
  });

  void runJob(job.id);
  return job;
}

export async function enqueuePhotoDressJob(opts: {
  projectId: string;
  roomId: string;
  filename: string;
  buffer: Buffer;
  mimeType: string;
}): Promise<Job> {
  const relative = await saveUpload(opts.filename, opts.buffer);
  const project = await getProject(opts.projectId);
  if (!project) throw new Error("Project not found");
  project.roomPhotos.push({
    roomId: opts.roomId,
    path: relative,
    uploadedAt: new Date().toISOString(),
  });
  await saveProject(project);

  const job = await createJob({
    projectId: opts.projectId,
    type: "photo_dress",
    message: "Dressing room from photo…",
    notifyAfterMs: NOTIFY_THRESHOLD_MS,
    result: { path: relative, mimeType: opts.mimeType, roomId: opts.roomId },
  });

  void runJob(job.id);
  return job;
}

export async function runJob(jobId: string) {
  const job = await getJob(jobId);
  if (!job) return;

  job.status = "running";
  job.progress = 10;
  job.message = "Starting…";
  await saveJob(job);

  const started = Date.now();
  const notifyTimer = setInterval(async () => {
    const current = await getJob(jobId);
    if (!current || current.status === "completed" || current.status === "failed")
      return;
    if (!current.notified && Date.now() - started >= current.notifyAfterMs) {
      current.notified = true;
      current.message = `${current.message} (notify: still working — check back soon)`;
      await saveJob(current);
      await createJob({
        projectId: current.projectId,
        type: "notify",
        message: `Long-running ${current.type} still in progress`,
        notifyAfterMs: 0,
        status: "completed",
        progress: 100,
        result: { parentJobId: current.id, channel: "in-app" },
      });
    }
  }, 5000);

  try {
    if (job.type === "floorplan_extract") {
      job.progress = 30;
      job.message = "Reading floorplan with vision…";
      await saveJob(job);

      const path = String(job.result?.path ?? "");
      const mimeType = String(job.result?.mimeType ?? "image/png");
      const buf = await fs.readFile(uploadAbsolutePath(path));
      const extract = await extractFloorplanFromImage({
        imageBase64: buf.toString("base64"),
        mimeType,
      });

      job.progress = 80;
      job.message = "Building blank shell…";
      await saveJob(job);

      const project = await getProject(job.projectId);
      if (!project) throw new Error("Project missing");
      project.scene = extract.scene;
      await saveProject(project);

      job.status = "completed";
      job.progress = 100;
      job.completedAt = new Date().toISOString();
      job.message = extract.needsInterrupt
        ? extract.interruptReason ?? "Needs confirmation"
        : "Blank shell ready";
      job.result = {
        ...job.result,
        needsInterrupt: extract.needsInterrupt,
        confidence: extract.confidence,
        interruptReason: extract.interruptReason,
      };
      await saveJob(job);
    } else if (job.type === "photo_dress") {
      job.progress = 25;
      job.message = "Analyzing room photo…";
      await saveJob(job);

      const path = String(job.result?.path ?? "");
      const mimeType = String(job.result?.mimeType ?? "image/jpeg");
      const roomId = String(job.result?.roomId ?? "");
      const buf = await fs.readFile(uploadAbsolutePath(path));
      const project = await getProject(job.projectId);
      if (!project) throw new Error("Project missing");

      job.progress = 55;
      job.message = "Matching catalog & materials…";
      await saveJob(job);

      const dressed = await dressRoomFromPhoto({
        scene: project.scene,
        roomId,
        imageBase64: buf.toString("base64"),
        mimeType,
      });

      // Progressive: apply materials first-ish by saving intermediate
      project.scene = {
        ...dressed.scene,
        assets: project.scene.assets,
      };
      await saveProject(project);
      job.progress = 75;
      job.message = "Placing furniture…";
      await saveJob(job);

      project.scene = dressed.scene;
      await saveProject(project);

      job.status = "completed";
      job.progress = 100;
      job.completedAt = new Date().toISOString();
      job.message = dressed.summary;
      job.result = {
        ...job.result,
        proposalIds: dressed.proposals.map((p) => p.id),
      };
      await saveJob(job);
    }
  } catch (err) {
    job.status = "failed";
    job.error = err instanceof Error ? err.message : "Unknown error";
    job.message = "Job failed";
    job.completedAt = new Date().toISOString();
    await saveJob(job);
  } finally {
    clearInterval(notifyTimer);
  }
}
