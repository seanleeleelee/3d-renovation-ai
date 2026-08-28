import { z } from "zod";
import {
  AI_VISION_MODEL,
  hasAnyAi,
  visionJson,
} from "@/lib/platform-ai";
import { createBlankSceneFromExtract, sceneBounds } from "@/lib/scene";
import type { Scene, Wall, Room } from "@/types/scene";

/**
 * Vision returns millimetres (as printed on the plan).
 * We convert to metres for the 3D scene.
 */
const ExtractSchema = z.object({
  confidence: z.number().min(0).max(1),
  scaleReadable: z.boolean(),
  overallWidthMm: z.number().positive(),
  overallDepthMm: z.number().positive(),
  rooms: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      /** Axis-aligned room in mm: bottom-left origin of unit. */
      xMm: z.number(),
      zMm: z.number(),
      widthMm: z.number().positive(),
      depthMm: z.number().positive(),
      /** Optional extra vertices in mm for L-shapes; if set, overrides the rect. */
      polygonMm: z.array(z.tuple([z.number(), z.number()])).min(3).optional(),
      ceilingHeightMm: z.number().optional(),
    }),
  ),
  hackWallsMm: z
    .array(
      z.object({
        id: z.string(),
        startMm: z.tuple([z.number(), z.number()]),
        endMm: z.tuple([z.number(), z.number()]),
        note: z.string().optional(),
      }),
    )
    .optional(),
  notes: z.string().optional(),
});

export type FloorplanExtractResult = {
  scene: Scene;
  confidence: number;
  needsInterrupt: boolean;
  interruptReason?: string;
  rawNotes?: string;
};

const BASE_PROMPT = `You are reconstructing a Singapore HDB / apartment floorplan.

IMPORTANT UNITS: All printed numbers on the drawing are MILLIMETRES (mm).
Return EVERY coordinate and length in millimetres. Do NOT convert to metres.
Examples: 12650, 9235, 3550, 3050, 1700, 2900 — keep as those integers.

Return ONLY JSON:
{
  "confidence": 0-1,
  "scaleReadable": true,
  "overallWidthMm": 12650,
  "overallDepthMm": 9235,
  "rooms": [
    {
      "id": "room-living",
      "name": "Living / Dining",
      "xMm": 0,
      "zMm": 0,
      "widthMm": 3550,
      "depthMm": 3550,
      "polygonMm": [[0,0],[...]],
      "ceilingHeightMm": 2700
    }
  ],
  "hackWallsMm": [
    {"id":"hack-1","startMm":[x,z],"endMm":[x,z],"note":"HACK non-structural"}
  ],
  "notes": "optional"
}

Coordinate system (mm):
- Origin = bottom-left corner of the UNIT footprint (not paper margin).
- +x = right (along overall width).
- +z = up toward the top of the image (along overall depth).
- overallWidthMm / overallDepthMm = the printed outer overall dimensions.

Room placement:
- Prefer axis-aligned rectangles via xMm,zMm,widthMm,depthMm matching printed sizes.
- For L-shaped Living / Dining, ALSO set polygonMm with 6+ vertices so it does not eat neighbors.
- If polygonMm is set, it is the authoritative footprint; x/z/width/depth should still be the AABB.
- Room interiors must NOT overlap. Shared walls share edges only.
- Bedrooms are separate cells (e.g. 3050×3550, 2950×3550, 3100×4950) — not thin horizontal strips.
- Household shelter, kitchen, service yard, baths, air-con ledge get their labeled footprints.
- Read the printed mm labels on the drawing; do not invent a strip layout.

Red HACK lines ("hack existing non structural wall"):
- Still include those partitions in room boundaries (blank shell keeps them).
- ALSO list them in hackWallsMm as segments to remove later.`;

const RETRY_PROMPT = `Previous JSON was geometrically wrong (strip bands and/or overlapping rooms).

Fix using the printed mm dimensions on the plan:
- Keep all values in MILLIMETRES (e.g. 12650 not 12.65).
- Place NON-OVERLAPPING axis-aligned rooms from the wall grid.
- Living may be L-shaped via polygonMm; do not cover kitchen/bedrooms.
- Outer envelope must equal overallWidthMm × overallDepthMm from the drawing.

Return corrected JSON only.`;

function mmToM(n: number): number {
  return n / 1000;
}

function rectPolygonM(
  xMm: number,
  zMm: number,
  widthMm: number,
  depthMm: number,
): [number, number][] {
  const x0 = mmToM(xMm);
  const z0 = mmToM(zMm);
  const x1 = mmToM(xMm + widthMm);
  const z1 = mmToM(zMm + depthMm);
  return [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
  ];
}

function fallbackRectScene(): FloorplanExtractResult {
  const paint = { color: "#f3f0ea", roughness: 0.9 };
  const rooms: Room[] = [
    {
      id: "room-1",
      name: "Main Room",
      polygon: [
        [0, 0],
        [5, 0],
        [5, 4],
        [0, 4],
      ],
      floorMaterial: { color: "#cfc7b8", roughness: 0.75 },
      ceilingHeight: 2.7,
    },
  ];
  const walls: Wall[] = [
    {
      id: "w1",
      roomIds: ["room-1"],
      start: [0, 0],
      end: [5, 0],
      height: 2.7,
      thickness: 0.12,
      material: paint,
    },
    {
      id: "w2",
      roomIds: ["room-1"],
      start: [5, 0],
      end: [5, 4],
      height: 2.7,
      thickness: 0.12,
      material: paint,
    },
    {
      id: "w3",
      roomIds: ["room-1"],
      start: [5, 4],
      end: [0, 4],
      height: 2.7,
      thickness: 0.12,
      material: paint,
    },
    {
      id: "w4",
      roomIds: ["room-1"],
      start: [0, 4],
      end: [0, 0],
      height: 2.7,
      thickness: 0.12,
      material: paint,
    },
  ];
  return {
    scene: createBlankSceneFromExtract({
      rooms,
      walls,
      confidence: 0.35,
      scaleMetersPerUnit: 1,
    }),
    confidence: 0.35,
    needsInterrupt: true,
    interruptReason: "Could not read scale confidently — confirm or retry.",
  };
}

function roomExtent(room: { polygon: [number, number][] }) {
  const xs = room.polygon.map((p) => p[0]);
  const zs = room.polygon.map((p) => p[1]);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
    width: Math.max(...xs) - Math.min(...xs),
    depth: Math.max(...zs) - Math.min(...zs),
  };
}

export function layoutLooksStripLike(rooms: Room[]): boolean {
  if (rooms.length < 4) return false;
  const bounds = sceneBounds(rooms);
  const envW = bounds.maxX - bounds.minX;
  const envD = bounds.maxZ - bounds.minZ;
  if (envW < 1 || envD < 1) return true;

  let stripCount = 0;
  for (const room of rooms) {
    const e = roomExtent(room);
    const spansWidth = e.width / envW > 0.85;
    const shallow = e.depth / envD < 0.28;
    const spansDepth = e.depth / envD > 0.85;
    const thin = e.width / envW < 0.28;
    if ((spansWidth && shallow) || (spansDepth && thin)) stripCount += 1;
  }

  const living = rooms.find((r) => /liv|din/i.test(r.name));
  if (living) {
    const e = roomExtent(living);
    if (e.width / envW > 0.9 && e.depth / envD < 0.45) return true;
  }

  return stripCount >= Math.ceil(rooms.length * 0.45);
}

function roomsOverlapBadly(rooms: Room[]): boolean {
  const aabbs = rooms.map((r) => ({ id: r.id, ...roomExtent(r) }));
  for (let i = 0; i < aabbs.length; i++) {
    for (let j = i + 1; j < aabbs.length; j++) {
      const a = aabbs[i];
      const b = aabbs[j];
      const ox = Math.max(
        0,
        Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX),
      );
      const oz = Math.max(
        0,
        Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ),
      );
      const overlap = ox * oz;
      if (overlap < 0.35) continue;
      const smaller = Math.min(a.width * a.depth, b.width * b.depth);
      if (smaller > 0 && overlap / smaller > 0.25) return true;
    }
  }
  return false;
}

/** If the model forgot and returned metres (~12) instead of mm (~12000), scale up. */
function normalizeMmValue(n: number, overallHint: number): number {
  if (overallHint > 100 && n > 0 && n < 50) return n * 1000;
  return n;
}

function layoutQualityIssues(
  data: z.infer<typeof ExtractSchema>,
  rooms: Room[],
): string[] {
  const issues: string[] = [];
  if (rooms.length < 2) issues.push("too few rooms");
  if (layoutLooksStripLike(rooms)) issues.push("strip-band layout");
  if (roomsOverlapBadly(rooms)) issues.push("rooms overlap interiors");

  const bounds = sceneBounds(rooms);
  const envW = bounds.maxX - bounds.minX;
  const envD = bounds.maxZ - bounds.minZ;
  const ow = mmToM(data.overallWidthMm);
  const od = mmToM(data.overallDepthMm);
  const wErr = Math.abs(envW - ow) / ow;
  const dErr = Math.abs(envD - od) / od;
  if (wErr > 0.18 || dErr > 0.18) {
    issues.push("envelope mismatch vs overallWidthMm/overallDepthMm");
  }
  if (envW > 8 && envD > 0 && envW / envD > 2.2) {
    issues.push("implausibly wide/shallow envelope");
  }
  return issues;
}

function toSceneRooms(data: z.infer<typeof ExtractSchema>): {
  rooms: Room[];
  walls: Wall[];
} {
  // Guard against model returning metres in mm fields
  let overallW = data.overallWidthMm;
  let overallD = data.overallDepthMm;
  if (overallW < 50) overallW *= 1000;
  if (overallD < 50) overallD *= 1000;

  const rooms: Room[] = data.rooms.map((r) => {
    const xMm = normalizeMmValue(r.xMm, overallW);
    const zMm = normalizeMmValue(r.zMm, overallD);
    const widthMm = normalizeMmValue(r.widthMm, overallW);
    const depthMm = normalizeMmValue(r.depthMm, overallD);
    const ceilingMm = r.ceilingHeightMm
      ? normalizeMmValue(r.ceilingHeightMm, 3000)
      : 2700;

    let polygon: [number, number][];
    if (r.polygonMm && r.polygonMm.length >= 3) {
      polygon = r.polygonMm.map(([x, z]) => [
        mmToM(normalizeMmValue(x, overallW)),
        mmToM(normalizeMmValue(z, overallD)),
      ]);
    } else {
      polygon = rectPolygonM(xMm, zMm, widthMm, depthMm);
    }

    return {
      id: r.id,
      name: r.name,
      polygon,
      ceilingHeight: mmToM(ceilingMm),
      floorMaterial: { color: "#cfc7b8", roughness: 0.75 },
    };
  });

  return { rooms, walls: [] };
}

async function runVisionExtract(
  opts: { imageBase64: string; mimeType: string },
  prompt: string,
): Promise<z.infer<typeof ExtractSchema> | null> {
  let parsed: unknown;
  try {
    parsed = await visionJson({
      model: AI_VISION_MODEL,
      prompt,
      imageBase64: opts.imageBase64,
      mimeType: opts.mimeType,
    });
  } catch (err) {
    console.error("[floorplan] extract failed", err);
    throw err;
  }

  const result = ExtractSchema.safeParse(parsed);
  if (!result.success) {
    console.error("[floorplan] schema mismatch", result.error.message);
    return null;
  }
  return result.data;
}

export async function extractFloorplanFromImage(opts: {
  imageBase64: string;
  mimeType: string;
}): Promise<FloorplanExtractResult> {
  if (!hasAnyAi()) {
    return fallbackRectScene();
  }

  let data = await runVisionExtract(opts, BASE_PROMPT);
  if (!data) return fallbackRectScene();

  let { rooms, walls } = toSceneRooms(data);
  let issues = layoutQualityIssues(data, rooms);

  if (issues.length) {
    console.warn("[floorplan] layout issues, retrying:", issues.join(", "));
    const retry = await runVisionExtract(
      opts,
      `${RETRY_PROMPT}\n\nIssues detected: ${issues.join("; ")}.\n\n${BASE_PROMPT}`,
    );
    if (retry) {
      const next = toSceneRooms(retry);
      const retryIssues = layoutQualityIssues(retry, next.rooms);
      if (
        retryIssues.length < issues.length ||
        (layoutLooksStripLike(rooms) && !layoutLooksStripLike(next.rooms)) ||
        (roomsOverlapBadly(rooms) && !roomsOverlapBadly(next.rooms))
      ) {
        data = retry;
        rooms = next.rooms;
        walls = next.walls;
        issues = retryIssues;
      }
    }
  }

  if (layoutLooksStripLike(rooms) || roomsOverlapBadly(rooms)) {
    console.warn("[floorplan] still bad after retry, second retry…");
    const retry2 = await runVisionExtract(
      opts,
      `${RETRY_PROMPT}\n\nStill invalid. Issues: ${issues.join("; ") || "overlap/strip"}.\nUse printed mm labels only.\n\n${BASE_PROMPT}`,
    );
    if (retry2) {
      const next = toSceneRooms(retry2);
      const retryIssues = layoutQualityIssues(retry2, next.rooms);
      if (
        retryIssues.length <= issues.length ||
        !roomsOverlapBadly(next.rooms)
      ) {
        data = retry2;
        rooms = next.rooms;
        walls = next.walls;
        issues = retryIssues;
      }
    }
  }

  if (layoutLooksStripLike(rooms) || roomsOverlapBadly(rooms)) {
    data = {
      ...data,
      confidence: Math.min(data.confidence, 0.45),
      scaleReadable: false,
    };
  }

  const needsInterrupt =
    !data.scaleReadable ||
    data.confidence < 0.6 ||
    layoutLooksStripLike(rooms) ||
    roomsOverlapBadly(rooms) ||
    issues.length > 0;

  let interruptReason: string | undefined;
  if (needsInterrupt) {
    if (layoutLooksStripLike(rooms) || roomsOverlapBadly(rooms)) {
      interruptReason =
        "Layout still looks wrong — please re-upload for another attempt.";
    } else {
      interruptReason =
        "Low confidence or unreadable scale — confirm scale or re-upload.";
    }
  }

  const notes = [
    data.notes,
    data.hackWallsMm?.length
      ? `Hack segments (mm): ${data.hackWallsMm.map((h) => h.id).join(", ")}`
      : undefined,
  ]
    .filter(Boolean)
    .join(" · ");

  const scene = createBlankSceneFromExtract({
    rooms,
    walls,
    confidence: data.confidence,
    scaleMetersPerUnit: 1,
  });
  if (notes) scene.notes = notes;

  return {
    scene,
    confidence: data.confidence,
    needsInterrupt,
    interruptReason,
    rawNotes: notes || data.notes,
  };
}
