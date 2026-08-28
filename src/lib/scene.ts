import { nanoid } from "nanoid";
import type { Scene } from "@/types/scene";

export function createMockScene(): Scene {
  const wallHeight = 2.7;
  const thickness = 0.12;
  const paint = { color: "#f3f0ea", roughness: 0.9 };
  const floor = { color: "#8b7355", roughness: 0.75 };

  return {
    version: 1,
    units: "m",
    scaleMetersPerUnit: 1,
    confidence: 0.92,
    rooms: [
      {
        id: "room-living",
        name: "Living Room",
        polygon: [
          [0, 0],
          [6, 0],
          [6, 4.5],
          [0, 4.5],
        ],
        floorMaterial: floor,
        ceilingHeight: wallHeight,
      },
      {
        id: "room-hall",
        name: "Hallway",
        polygon: [
          [6, 1.2],
          [9, 1.2],
          [9, 3.2],
          [6, 3.2],
        ],
        floorMaterial: { color: "#c47a5a", roughness: 0.7 },
        ceilingHeight: wallHeight,
      },
      {
        id: "room-kitchen",
        name: "Kitchen",
        polygon: [
          [0, 4.5],
          [4, 4.5],
          [4, 7.5],
          [0, 7.5],
        ],
        floorMaterial: { color: "#d9d2c5", roughness: 0.65 },
        ceilingHeight: wallHeight,
      },
    ],
    walls: [
      {
        id: "wall-living-s",
        roomIds: ["room-living"],
        start: [0, 0],
        end: [6, 0],
        height: wallHeight,
        thickness,
        material: paint,
      },
      {
        id: "wall-living-w",
        roomIds: ["room-living", "room-kitchen"],
        start: [0, 0],
        end: [0, 4.5],
        height: wallHeight,
        thickness,
        material: paint,
      },
      {
        id: "wall-living-n",
        roomIds: ["room-living", "room-kitchen"],
        start: [0, 4.5],
        end: [6, 4.5],
        height: wallHeight,
        thickness,
        material: paint,
      },
      {
        id: "wall-living-e",
        roomIds: ["room-living", "room-hall"],
        start: [6, 0],
        end: [6, 4.5],
        height: wallHeight,
        thickness,
        material: paint,
      },
      {
        id: "wall-hall-n",
        roomIds: ["room-hall"],
        start: [6, 3.2],
        end: [9, 3.2],
        height: wallHeight,
        thickness,
        material: paint,
      },
      {
        id: "wall-hall-s",
        roomIds: ["room-hall"],
        start: [6, 1.2],
        end: [9, 1.2],
        height: wallHeight,
        thickness,
        material: paint,
      },
      {
        id: "wall-hall-e",
        roomIds: ["room-hall"],
        start: [9, 1.2],
        end: [9, 3.2],
        height: wallHeight,
        thickness,
        material: paint,
      },
      {
        id: "wall-kitchen-n",
        roomIds: ["room-kitchen"],
        start: [0, 7.5],
        end: [4, 7.5],
        height: wallHeight,
        thickness,
        material: paint,
      },
      {
        id: "wall-kitchen-e",
        roomIds: ["room-kitchen"],
        start: [4, 4.5],
        end: [4, 7.5],
        height: wallHeight,
        thickness,
        material: paint,
      },
      {
        id: "wall-kitchen-w",
        roomIds: ["room-kitchen"],
        start: [0, 4.5],
        end: [0, 7.5],
        height: wallHeight,
        thickness,
        material: paint,
      },
    ],
    assets: [
      {
        id: nanoid(8),
        catalogId: "sofa-olive",
        roomId: "room-living",
        position: [2.8, 0, 2.2],
        rotationY: Math.PI,
        scale: 1,
        label: "Sofa",
      },
      {
        id: nanoid(8),
        catalogId: "coffee-table",
        roomId: "room-living",
        position: [2.8, 0, 1.2],
        rotationY: 0,
        scale: 1,
        label: "Coffee table",
      },
    ],
    proposals: [],
    camera: {
      mode: "orbit",
      position: [8, 7, 8],
      target: [4, 0, 3.5],
    },
    notes: "Mock starter scene",
  };
}

export function createBlankSceneFromExtract(input: {
  rooms: Scene["rooms"];
  walls: Scene["walls"];
  confidence: number;
  scaleMetersPerUnit: number;
}): Scene {
  // Walls from room edges are more reliable than sparse AI wall lists.
  const derived = wallsFromRoomPolygons(input.rooms);
  const finalWalls = derived.length >= 3 ? derived : input.walls;

  const bounds = sceneBounds(input.rooms);
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;
  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ, 8);

  return {
    version: 1,
    units: "m",
    scaleMetersPerUnit: input.scaleMetersPerUnit,
    confidence: input.confidence,
    rooms: input.rooms,
    walls: finalWalls.length ? finalWalls : input.walls,
    assets: [],
    proposals: [],
    camera: {
      mode: "orbit",
      position: [cx + span * 0.75, span * 0.7, cz + span * 0.75],
      target: [cx, 0, cz],
    },
  };
}

export function sceneBounds(rooms: Scene["rooms"]) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const room of rooms) {
    for (const [x, z] of room.polygon) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
  }
  if (!Number.isFinite(minX)) {
    return { minX: 0, maxX: 10, minZ: 0, maxZ: 10 };
  }
  return { minX, maxX, minZ, maxZ };
}

/** Build unique wall segments from room polygon edges (meters). */
export function wallsFromRoomPolygons(rooms: Scene["rooms"]): Scene["walls"] {
  const paint = { color: "#f3f0ea", roughness: 0.9 };
  const edgeMap = new Map<
    string,
    { start: [number, number]; end: [number, number]; roomIds: string[] }
  >();

  const keyFor = (a: [number, number], b: [number, number]) => {
    const round = (n: number) => Math.round(n * 100) / 100;
    const a1: [number, number] = [round(a[0]), round(a[1])];
    const b1: [number, number] = [round(b[0]), round(b[1])];
    const forward = `${a1[0]},${a1[1]}|${b1[0]},${b1[1]}`;
    const backward = `${b1[0]},${b1[1]}|${a1[0]},${a1[1]}`;
    return forward < backward ? forward : backward;
  };

  for (const room of rooms) {
    const pts = room.polygon;
    for (let i = 0; i < pts.length; i++) {
      const start = pts[i];
      const end = pts[(i + 1) % pts.length];
      if (Math.hypot(end[0] - start[0], end[1] - start[1]) < 0.05) continue;
      const key = keyFor(start, end);
      const existing = edgeMap.get(key);
      if (existing) {
        if (!existing.roomIds.includes(room.id)) existing.roomIds.push(room.id);
      } else {
        edgeMap.set(key, {
          start: [start[0], start[1]],
          end: [end[0], end[1]],
          roomIds: [room.id],
        });
      }
    }
  }

  let i = 0;
  return [...edgeMap.values()].map((e) => ({
    id: `wall-auto-${++i}`,
    roomIds: e.roomIds,
    start: e.start,
    end: e.end,
    height: 2.7,
    thickness: 0.12,
    material: paint,
  }));
}

export function roomCentroid(room: Scene["rooms"][number]): [number, number] {
  const xs = room.polygon.map((p) => p[0]);
  const zs = room.polygon.map((p) => p[1]);
  const x = xs.reduce((a, b) => a + b, 0) / xs.length;
  const z = zs.reduce((a, b) => a + b, 0) / zs.length;
  return [x, z];
}
