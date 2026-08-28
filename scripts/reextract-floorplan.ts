/**
 * One-off: re-extract floorplan into an existing project using local env.
 * Usage: npx --yes tsx --tsconfig tsconfig.json scripts/reextract-floorplan.ts [projectId]
 */
import fs from "node:fs/promises";
import path from "node:path";

async function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  const text = await fs.readFile(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

async function main() {
  await loadEnvLocal();
  const projectId = process.argv[2] || "2a9Hr3DWYD9z";
  const { extractFloorplanFromImage, layoutLooksStripLike } = await import(
    "../src/lib/floorplan"
  );
  const { getProject, saveProject, uploadAbsolutePath } = await import(
    "../src/lib/store"
  );

  const project = await getProject(projectId);
  if (!project?.floorplanPath) {
    throw new Error(`Project ${projectId} missing or has no floorplanPath`);
  }

  const abs = uploadAbsolutePath(project.floorplanPath);
  const buf = await fs.readFile(abs);
  const mimeType =
    abs.endsWith(".jpg") || abs.endsWith(".jpeg") ? "image/jpeg" : "image/png";

  console.log("Re-extracting", project.floorplanPath, "…");
  const extract = await extractFloorplanFromImage({
    imageBase64: buf.toString("base64"),
    mimeType,
  });

  const rooms = extract.scene.rooms;
  console.log(
    "rooms",
    rooms.length,
    "walls",
    extract.scene.walls.length,
    "confidence",
    extract.confidence,
    "stripLike",
    layoutLooksStripLike(rooms),
    "interrupt",
    extract.needsInterrupt,
  );
  for (const r of rooms) {
    const xs = r.polygon.map((p) => p[0]);
    const zs = r.polygon.map((p) => p[1]);
    console.log(
      `  ${r.name}: x ${Math.min(...xs).toFixed(2)}-${Math.max(...xs).toFixed(2)} z ${Math.min(...zs).toFixed(2)}-${Math.max(...zs).toFixed(2)} pts ${r.polygon.length}`,
    );
  }
  console.log("camera", extract.scene.camera);

  project.scene = extract.scene;
  await saveProject(project);
  console.log("Saved project", projectId);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
