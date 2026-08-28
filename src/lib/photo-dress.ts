import { z } from "zod";
import { nanoid } from "nanoid";
import {
  AI_PHOTO_MODEL,
  hasAnyAi,
  visionJson,
} from "@/lib/platform-ai";
import { matchCatalog, PRESET_MATERIALS } from "@/lib/catalog";
import { roomCentroid } from "@/lib/scene";
import type { PlacedAsset, Proposal, Scene } from "@/types/scene";

const DressSchema = z.object({
  wallColor: z.string().optional(),
  floorMaterialKey: z.enum(["wood_floor", "tile_terracotta", "soft_grey"]).optional(),
  furniture: z.array(
    z.object({
      labels: z.array(z.string()),
      approxPosition: z
        .object({
          xNorm: z.number().min(0).max(1),
          zNorm: z.number().min(0).max(1),
        })
        .optional(),
    }),
  ),
  missingWallIds: z.array(z.string()).default([]),
  notes: z.string().optional(),
});

export type DressResult = {
  scene: Scene;
  proposals: Proposal[];
  summary: string;
};

function heuristicDress(scene: Scene, roomId: string): DressResult {
  const room = scene.rooms.find((r) => r.id === roomId);
  if (!room) {
    return { scene, proposals: [], summary: "Room not found" };
  }
  const [cx, cz] = roomCentroid(room);
  const sofa = matchCatalog(["sofa", "olive"]);
  const table = matchCatalog(["coffee table"]);
  const assets: PlacedAsset[] = [
    {
      id: nanoid(8),
      catalogId: sofa.id,
      roomId,
      position: [cx, 0, cz + 0.4],
      rotationY: Math.PI,
      scale: 1,
      label: sofa.name,
    },
    {
      id: nanoid(8),
      catalogId: table.id,
      roomId,
      position: [cx, 0, cz - 0.5],
      rotationY: 0,
      scale: 1,
      label: table.name,
    },
  ];

  const next: Scene = {
    ...scene,
    rooms: scene.rooms.map((r) =>
      r.id === roomId
        ? {
            ...r,
            floorMaterial: PRESET_MATERIALS.wood_floor,
          }
        : r,
    ),
    walls: scene.walls.map((w) =>
      w.roomIds.includes(roomId)
        ? { ...w, material: PRESET_MATERIALS.warm_white }
        : w,
    ),
    assets: [
      ...scene.assets.filter((a) => a.roomId !== roomId),
      ...assets,
    ],
  };

  const sharedWall = scene.walls.find(
    (w) => w.roomIds.includes(roomId) && w.roomIds.length > 1 && !w.removed,
  );
  const proposals: Proposal[] = [];
  if (sharedWall) {
    const proposal: Proposal = {
      id: nanoid(8),
      type: "remove_wall",
      wallId: sharedWall.id,
      reason: "Photo may show a more open connection — confirm before removing.",
      status: "pending",
      source: "photo",
      createdAt: new Date().toISOString(),
    };
    proposals.push(proposal);
    next.proposals = [...scene.proposals.filter((p) => p.status === "pending"), proposal];
  }

  return {
    scene: next,
    proposals,
    summary: "Applied heuristic materials and catalog furniture (no API key / offline).",
  };
}

export async function dressRoomFromPhoto(opts: {
  scene: Scene;
  roomId: string;
  imageBase64: string;
  mimeType: string;
}): Promise<DressResult> {
  if (!hasAnyAi()) {
    return heuristicDress(opts.scene, opts.roomId);
  }

  const room = opts.scene.rooms.find((r) => r.id === opts.roomId);
  if (!room) {
    return { scene: opts.scene, proposals: [], summary: "Room not found" };
  }

  const wallIds = opts.scene.walls
    .filter((w) => w.roomIds.includes(opts.roomId) && !w.removed)
    .map((w) => w.id);

  const prompt = `Analyze this interior photo for room "${room.name}".
Known wall ids in this room: ${wallIds.join(", ") || "(none)"}.
Return JSON:
{
  "wallColor": "#rrggbb",
  "floorMaterialKey": "wood_floor" | "tile_terracotta" | "soft_grey",
  "furniture": [{"labels":["sofa","olive"],"approxPosition":{"xNorm":0.5,"zNorm":0.6}}],
  "missingWallIds": ["wall-id-if-photo-suggests-open"],
  "notes": "..."
}
Only include missingWallIds when the photo strongly suggests that wall/opening is gone or open-plan.`;

  let parsed: unknown;
  try {
    parsed = await visionJson({
      model: AI_PHOTO_MODEL,
      prompt,
      imageBase64: opts.imageBase64,
      mimeType: opts.mimeType,
    });
  } catch (err) {
    console.error("[photo-dress] failed", err);
    throw err;
  }

  const result = DressSchema.safeParse(parsed);
  if (!result.success) {
    return heuristicDress(opts.scene, opts.roomId);
  }
  const data = result.data;

  const xs = room.polygon.map((p) => p[0]);
  const zs = room.polygon.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);

  const assets: PlacedAsset[] = data.furniture.map((f) => {
    const item = matchCatalog(f.labels);
    const xn = f.approxPosition?.xNorm ?? 0.5;
    const zn = f.approxPosition?.zNorm ?? 0.5;
    return {
      id: nanoid(8),
      catalogId: item.id,
      roomId: opts.roomId,
      position: [
        minX + (maxX - minX) * xn,
        0,
        minZ + (maxZ - minZ) * zn,
      ],
      rotationY: 0,
      scale: 1,
      label: item.name,
    };
  });

  const floorMat =
    PRESET_MATERIALS[data.floorMaterialKey ?? "wood_floor"] ??
    PRESET_MATERIALS.wood_floor;
  const wallMat = data.wallColor
    ? { color: data.wallColor, roughness: 0.9 }
    : PRESET_MATERIALS.warm_white;

  const proposals: Proposal[] = data.missingWallIds
    .filter((id) => wallIds.includes(id))
    .map((wallId) => ({
      id: nanoid(8),
      type: "remove_wall" as const,
      wallId,
      reason: data.notes ?? "Photo suggests this wall/opening is removed.",
      status: "pending" as const,
      source: "photo" as const,
      createdAt: new Date().toISOString(),
    }));

  const next: Scene = {
    ...opts.scene,
    rooms: opts.scene.rooms.map((r) =>
      r.id === opts.roomId ? { ...r, floorMaterial: floorMat } : r,
    ),
    walls: opts.scene.walls.map((w) =>
      w.roomIds.includes(opts.roomId) ? { ...w, material: wallMat } : w,
    ),
    assets: [
      ...opts.scene.assets.filter((a) => a.roomId !== opts.roomId),
      ...assets,
    ],
    proposals: [
      ...opts.scene.proposals.filter((p) => p.status === "pending"),
      ...proposals,
    ],
  };

  return {
    scene: next,
    proposals,
    summary: data.notes ?? "Room dressed from photo.",
  };
}
