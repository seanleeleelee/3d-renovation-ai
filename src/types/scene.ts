export type Vec3 = [number, number, number];

export type MaterialRef = {
  color: string;
  roughness?: number;
  metalness?: number;
};

export type Wall = {
  id: string;
  roomIds: string[];
  start: [number, number];
  end: [number, number];
  height: number;
  thickness: number;
  removed?: boolean;
  material: MaterialRef;
};

export type Room = {
  id: string;
  name: string;
  polygon: [number, number][];
  floorMaterial: MaterialRef;
  ceilingHeight: number;
};

export type PlacedAsset = {
  id: string;
  catalogId: string;
  roomId: string;
  position: Vec3;
  rotationY: number;
  scale: number;
  label?: string;
};

export type Proposal = {
  id: string;
  type: "remove_wall";
  wallId: string;
  reason: string;
  status: "pending" | "accepted" | "rejected";
  source: "photo" | "chat" | "manual";
  createdAt: string;
};

export type SceneCamera = {
  mode: "orbit" | "walk";
  roomId?: string;
  position: Vec3;
  target: Vec3;
};

export type Scene = {
  version: number;
  units: "m";
  scaleMetersPerUnit: number;
  confidence: number;
  rooms: Room[];
  walls: Wall[];
  assets: PlacedAsset[];
  proposals: Proposal[];
  camera: SceneCamera;
  notes?: string;
};

export type ProjectCommit = {
  id: string;
  name: string;
  createdAt: string;
  scene: Scene;
};

export type JobStatus = "queued" | "running" | "completed" | "failed";

export type Job = {
  id: string;
  projectId: string;
  type: "floorplan_extract" | "photo_dress" | "notify";
  status: JobStatus;
  progress: number;
  message: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  result?: Record<string, unknown>;
  error?: string;
  notifyAfterMs: number;
  notified?: boolean;
};

export type Project = {
  id: string;
  title: string;
  ownerId: string | null;
  guestId: string | null;
  scene: Scene;
  draftUpdatedAt: string;
  createdAt: string;
  commits: ProjectCommit[];
  floorplanPath?: string;
  /** Optional SketchUp/GLB reference shell (public URL). */
  shellModelUrl?: string;
  roomPhotos: { roomId: string; path: string; uploadedAt: string }[];
  jobs: string[];
};
