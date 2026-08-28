/**
 * Apply a calibrated shell for the uploaded Bishan measured plan (mm → m).
 * Origin = bottom-left of unit footprint. Printed overall 12650 × 9235 mm.
 */
import { createBlankSceneFromExtract, wallsFromRoomPolygons } from "../src/lib/scene";
import { getProject, saveProject } from "../src/lib/store";
import type { Room } from "../src/types/scene";

const mm = (n: number) => n / 1000;

function rect(
  id: string,
  name: string,
  xMm: number,
  zMm: number,
  wMm: number,
  dMm: number,
): Room {
  return {
    id,
    name,
    polygon: [
      [mm(xMm), mm(zMm)],
      [mm(xMm + wMm), mm(zMm)],
      [mm(xMm + wMm), mm(zMm + dMm)],
      [mm(xMm), mm(zMm + dMm)],
    ],
    ceilingHeight: 2.7,
    floorMaterial: { color: "#cfc7b8", roughness: 0.75 },
  };
}

function buildBishanRooms(): Room[] {
  const W = 12650;
  const D = 9235;

  // Right stack (top → bottom): main 4950 + baths 1590 + ledge 2695
  const ledgeH = 2695;
  const bathH = 1590;
  const mainDepth = 4950;
  const mainZ0 = ledgeH + bathH; // 4285
  const bedDepth = 3550;
  const bedZ0 = D - bedDepth; // 5685

  // Top row (left → right): living bay 3550 | bed3 3050 | bed2 2950 | main 3100
  const livingBayW = 3550;
  const bed3W = 3050;
  const bed2W = 2950;
  const mainW = 3100;
  const bed3X = livingBayW; // 3550
  const bed2X = bed3X + bed3W; // 6600
  const mainX = bed2X + bed2W; // 9550

  // Bottom row: left bay 3550 | kitchen 3595 | yard 1470 | (ledge under main)
  const kitchenW = 3595;
  const yardW = 1470;
  const kitchenX = livingBayW; // 3550
  const yardX = kitchenX + kitchenW; // 7145

  // Left stack (bottom → top): 1385 + HS 2900 + living 3550 + 1400
  const bottomOffset = 1385;
  const hsH = 2900;
  const hsW = 1700;
  const hsZ0 = bottomOffset; // 1385
  const hsZ1 = hsZ0 + hsH; // 4285

  const rooms: Room[] = [
    // Living / Dining — L-shape around HS / kitchen / baths (mm from plan)
    {
      id: "room-living",
      name: "Living / Dining",
      polygon: [
        [mm(0), mm(D)],
        [mm(bed3X), mm(D)],
        [mm(bed3X), mm(bedZ0)],
        [mm(mainX), mm(bedZ0)],
        [mm(mainX), mm(mainZ0)],
        [mm(yardX), mm(mainZ0)],
        [mm(yardX), mm(ledgeH)],
        [mm(kitchenX), mm(ledgeH)],
        [mm(kitchenX), mm(hsZ1)],
        [mm(0), mm(hsZ1)],
      ],
      ceilingHeight: 2.7,
      floorMaterial: { color: "#d4c4a8", roughness: 0.75 },
    },
    rect("room-bedroom-3", "Bedroom 3", bed3X, bedZ0, bed3W, bedDepth),
    rect("room-bedroom-2", "Bedroom 2", bed2X, bedZ0, bed2W, bedDepth),
    rect("room-main-bedroom", "Main Bedroom", mainX, mainZ0, mainW, mainDepth),
    rect("room-household-shelter", "Household Shelter", 0, hsZ0, hsW, hsH),
    rect("room-entry", "Entry", 0, 0, livingBayW, bottomOffset),
    rect("room-kitchen", "Kitchen", kitchenX, 0, kitchenW, ledgeH),
    rect("room-service-yard", "Service Yard", yardX, 0, yardW, ledgeH),
    // Baths sit in 1590 band under the bedroom wing (non-overlapping)
    rect("room-bath-2", "Bath/WC 2", yardX, ledgeH, 1405, bathH),
    rect(
      "room-bath-1",
      "Bath/WC 1",
      yardX + 1405,
      ledgeH,
      mainX - (yardX + 1405),
      bathH,
    ),
    rect("room-aircon-ledge", "Air-Con Ledge", mainX, 0, mainW, ledgeH),
  ];

  // Drop tiny entry if it makes envelope messy — keep for completeness
  void W;
  return rooms;
}

async function main() {
  const projectId = process.argv[2] || "2a9Hr3DWYD9z";
  const project = await getProject(projectId);
  if (!project) throw new Error("project missing");

  const rooms = buildBishanRooms();
  const walls = wallsFromRoomPolygons(rooms);
  const scene = createBlankSceneFromExtract({
    rooms,
    walls,
    confidence: 0.98,
    scaleMetersPerUnit: 1,
  });
  scene.notes =
    "Calibrated from printed mm (12650 × 9235). Red HACK walls kept in shell.";

  for (const r of rooms) {
    const xs = r.polygon.map((p) => p[0]);
    const zs = r.polygon.map((p) => p[1]);
    console.log(
      r.name.padEnd(22),
      `${(Math.min(...xs) * 1000).toFixed(0)}-${(Math.max(...xs) * 1000).toFixed(0)} × ${(Math.min(...zs) * 1000).toFixed(0)}-${(Math.max(...zs) * 1000).toFixed(0)} mm`,
    );
  }
  console.log("walls", scene.walls.length, "envelope", "12650 × 9235 mm");

  project.scene = scene;
  await saveProject(project);
  console.log("Saved", projectId);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
