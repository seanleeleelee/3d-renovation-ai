"use client";

import { useMemo } from "react";
import { Text } from "@react-three/drei";
import { sceneBounds } from "@/lib/scene";
import type { Scene } from "@/types/scene";

function niceStepMeters(spanM: number): number {
  if (spanM <= 6) return 0.5;
  if (spanM <= 14) return 1;
  if (spanM <= 28) return 2;
  return 5;
}

function formatMm(meters: number): string {
  return `${Math.round(meters * 1000)}`;
}

function MmText({
  position,
  children,
  fontSize = 0.28,
  rotateY = 0,
}: {
  position: [number, number, number];
  children: string;
  fontSize?: number;
  rotateY?: number;
}) {
  return (
    <Text
      position={position}
      rotation={[-Math.PI / 2, rotateY, 0]}
      fontSize={fontSize}
      color="#e2e8f0"
      anchorX="center"
      anchorY="middle"
      outlineWidth={0.012}
      outlineColor="#0b1020"
      depthOffset={-1}
    >
      {children}
    </Text>
  );
}

/** Floor grid + mm dimension bars/labels in world space. */
export function MeasuredGrid({ scene }: { scene: Scene }) {
  const bounds = useMemo(() => {
    const fromRooms = sceneBounds(scene.rooms);
    // Also fit walls if present (SketchUp-extracted shell)
    let minX = fromRooms.minX;
    let maxX = fromRooms.maxX;
    let minZ = fromRooms.minZ;
    let maxZ = fromRooms.maxZ;
    for (const w of scene.walls) {
      if (w.removed) continue;
      minX = Math.min(minX, w.start[0], w.end[0]);
      maxX = Math.max(maxX, w.start[0], w.end[0]);
      minZ = Math.min(minZ, w.start[1], w.end[1]);
      maxZ = Math.max(maxZ, w.start[1], w.end[1]);
    }
    if (!Number.isFinite(minX)) {
      return { minX: 0, maxX: 10, minZ: 0, maxZ: 10 };
    }
    return { minX, maxX, minZ, maxZ };
  }, [scene.rooms, scene.walls]);

  const widthM = Math.max(bounds.maxX - bounds.minX, 0.01);
  const depthM = Math.max(bounds.maxZ - bounds.minZ, 0.01);
  const step = niceStepMeters(Math.max(widthM, depthM));

  const ticksX = useMemo(() => {
    const out: number[] = [];
    const start = Math.ceil(bounds.minX / step) * step;
    for (let x = start; x <= bounds.maxX + 1e-6; x += step) {
      out.push(Number(x.toFixed(3)));
    }
    if (out.length === 0 || out[0] !== bounds.minX) out.unshift(bounds.minX);
    if (out[out.length - 1] !== bounds.maxX) out.push(bounds.maxX);
    return out;
  }, [bounds.maxX, bounds.minX, step]);

  const ticksZ = useMemo(() => {
    const out: number[] = [];
    const start = Math.ceil(bounds.minZ / step) * step;
    for (let z = start; z <= bounds.maxZ + 1e-6; z += step) {
      out.push(Number(z.toFixed(3)));
    }
    if (out.length === 0 || out[0] !== bounds.minZ) out.unshift(bounds.minZ);
    if (out[out.length - 1] !== bounds.maxZ) out.push(bounds.maxZ);
    return out;
  }, [bounds.maxZ, bounds.minZ, step]);

  const gridSize = Math.max(Math.ceil(Math.max(widthM, depthM) + 6), 14);
  const divisions = Math.max(Math.round(gridSize / step), 4);
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;
  const pad = 0.85;

  return (
    <group>
      <gridHelper
        args={[gridSize, divisions, "#475569", "#1e293b"]}
        position={[cx, -0.02, cz]}
      />

      {/* Width dimension (south edge) */}
      <mesh position={[cx, 0.03, bounds.minZ - pad]}>
        <boxGeometry args={[widthM, 0.03, 0.035]} />
        <meshBasicMaterial color="#38bdf8" />
      </mesh>
      <mesh position={[bounds.minX, 0.03, bounds.minZ - pad]}>
        <boxGeometry args={[0.035, 0.03, 0.22]} />
        <meshBasicMaterial color="#38bdf8" />
      </mesh>
      <mesh position={[bounds.maxX, 0.03, bounds.minZ - pad]}>
        <boxGeometry args={[0.035, 0.03, 0.22]} />
        <meshBasicMaterial color="#38bdf8" />
      </mesh>
      <MmText
        position={[cx, 0.06, bounds.minZ - pad - 0.45]}
        fontSize={0.32}
      >
        {`${formatMm(widthM)} mm`}
      </MmText>

      {/* Depth dimension (west edge) */}
      <mesh position={[bounds.minX - pad, 0.03, cz]}>
        <boxGeometry args={[0.035, 0.03, depthM]} />
        <meshBasicMaterial color="#38bdf8" />
      </mesh>
      <mesh position={[bounds.minX - pad, 0.03, bounds.minZ]}>
        <boxGeometry args={[0.22, 0.03, 0.035]} />
        <meshBasicMaterial color="#38bdf8" />
      </mesh>
      <mesh position={[bounds.minX - pad, 0.03, bounds.maxZ]}>
        <boxGeometry args={[0.22, 0.03, 0.035]} />
        <meshBasicMaterial color="#38bdf8" />
      </mesh>
      <MmText
        position={[bounds.minX - pad - 0.5, 0.06, cz]}
        fontSize={0.32}
        rotateY={Math.PI / 2}
      >
        {`${formatMm(depthM)} mm`}
      </MmText>

      {ticksX.map((x) => (
        <group key={`x-${x}`}>
          <mesh position={[x, 0.04, bounds.minZ - pad]}>
            <boxGeometry args={[0.04, 0.02, 0.14]} />
            <meshBasicMaterial color="#94a3b8" />
          </mesh>
          <MmText
            position={[x, 0.05, bounds.minZ - pad - 0.95]}
            fontSize={0.2}
          >
            {formatMm(x - bounds.minX)}
          </MmText>
        </group>
      ))}

      {ticksZ.map((z) => (
        <group key={`z-${z}`}>
          <mesh position={[bounds.minX - pad, 0.04, z]}>
            <boxGeometry args={[0.14, 0.02, 0.04]} />
            <meshBasicMaterial color="#94a3b8" />
          </mesh>
          <MmText
            position={[bounds.minX - pad - 0.95, 0.05, z]}
            fontSize={0.2}
            rotateY={Math.PI / 2}
          >
            {formatMm(z - bounds.minZ)}
          </MmText>
        </group>
      ))}

      <MmText position={[cx, 0.05, bounds.maxZ + pad + 0.2]} fontSize={0.18}>
        {"mm · origin bottom-left"}
      </MmText>
    </group>
  );
}

/** Compact HUD chip (does not replace 3D labels). */
export function MeasuredGridOverlay({ scene }: { scene: Scene }) {
  const bounds = useMemo(() => sceneBounds(scene.rooms), [scene.rooms]);
  const widthM = Math.max(bounds.maxX - bounds.minX, 0.01);
  const depthM = Math.max(bounds.maxZ - bounds.minZ, 0.01);

  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-[1] rounded-md bg-black/55 px-2.5 py-1.5 font-mono text-[11px] text-sky-100 backdrop-blur md:bottom-4">
      {formatMm(widthM)} × {formatMm(depthM)} mm
    </div>
  );
}
