"use client";

import { Suspense, useMemo, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { ContactShadows } from "@react-three/drei";
import type { Scene } from "@/types/scene";
import {
  CatalogAssetMesh,
  RoomFloor,
  WallMesh,
} from "@/components/viewer/HouseMeshes";
import {
  ExploreCamera,
  WalkCamera,
  type JoystickState,
} from "@/components/viewer/CameraControls";
import { MeasuredGrid, MeasuredGridOverlay } from "@/components/viewer/MeasuredGrid";
import { ReferenceShellModel } from "@/components/viewer/ReferenceShellModel";
import { WalkJoystick } from "@/components/viewer/WalkJoystick";
import { roomCentroid } from "@/lib/scene";

export type Selection =
  | { type: "wall"; id: string }
  | { type: "room"; id: string }
  | { type: "asset"; id: string }
  | null;

export function SceneViewer({
  scene,
  selection,
  onSelect,
  mode,
  walkRoomId,
  shellModelUrl,
}: {
  scene: Scene;
  selection: Selection;
  onSelect: (sel: Selection) => void;
  mode: "orbit" | "walk";
  walkRoomId?: string;
  shellModelUrl?: string;
}) {
  const walkRoom = scene.rooms.find((r) => r.id === walkRoomId) ?? scene.rooms[0];
  const spawn = useMemo((): [number, number, number] => {
    if (!walkRoom) return [2, 1.55, 2];
    const [x, z] = roomCentroid(walkRoom);
    return [x, 1.55, z];
  }, [walkRoom]);

  const joystick = useRef<JoystickState>({ x: 0, y: 0 });
  const hasShell = Boolean(shellModelUrl);
  const hitProxyWalls = hasShell;
  const showFloors = !hasShell;
  const removedWalls = useMemo(
    () => scene.walls.filter((w) => w.removed),
    [scene.walls],
  );

  return (
    <div className="relative z-0 h-full w-full overflow-hidden touch-none bg-[radial-gradient(ellipse_at_top,_#1a2332_0%,_#0b1020_55%,_#070a12_100%)]">
      <Canvas shadows dpr={[1, 2]}>
        <color attach="background" args={["#0b1020"]} />
        <ambientLight intensity={0.7} />
        <directionalLight
          castShadow
          position={[8, 14, 6]}
          intensity={1.15}
          shadow-mapSize={[1024, 1024]}
        />
        <hemisphereLight args={["#c9d6ff", "#3a2f24", 0.35]} />

        {mode === "orbit" ? (
          <ExploreCamera
            position={scene.camera.position}
            target={scene.camera.target}
          />
        ) : (
          <WalkCamera spawn={spawn} joystick={joystick} />
        )}

        {hasShell && shellModelUrl && (
          <Suspense fallback={null}>
            <ReferenceShellModel
              url={shellModelUrl}
              opacity={1}
              sourceUnit="mm"
              keepHalf="max-x"
              flip
              removedWalls={removedWalls}
            />
          </Suspense>
        )}

        <group>
            {showFloors &&
              scene.rooms.map((room) => (
                <RoomFloor
                  key={room.id}
                  room={room}
                  selected={
                    selection?.type === "room" && selection.id === room.id
                  }
                  onSelect={(id) => onSelect({ type: "room", id })}
                />
              ))}
            {scene.walls.map((wall) => (
              <WallMesh
                key={wall.id}
                wall={wall}
                hitProxy={hitProxyWalls}
                selected={selection?.type === "wall" && selection.id === wall.id}
                onSelect={(id) => onSelect({ type: "wall", id })}
              />
            ))}
            {scene.assets.map((asset) => (
              <CatalogAssetMesh
                key={asset.id}
                asset={asset}
                selected={
                  selection?.type === "asset" && selection.id === asset.id
                }
                onSelect={(id) => onSelect({ type: "asset", id })}
              />
            ))}
        </group>

        <ContactShadows
          position={[0, 0, 0]}
          opacity={0.35}
          scale={60}
          blur={2.5}
          far={20}
        />
        {mode === "orbit" && (
          <Suspense fallback={null}>
            <MeasuredGrid scene={scene} />
          </Suspense>
        )}
      </Canvas>

      {mode === "orbit" && <MeasuredGridOverlay scene={scene} />}

      {mode === "walk" && (
        <>
          <WalkJoystick stateRef={joystick} />
          <p className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full bg-black/45 px-3 py-1 text-[11px] text-white/75 backdrop-blur">
            Drag to look · joystick / WASD to move
          </p>
        </>
      )}

      {mode === "orbit" && (
        <p className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full bg-black/45 px-3 py-1 text-[11px] text-white/75 backdrop-blur md:left-[calc(50%-170px)]">
          {shellModelUrl
            ? "Tap a wall to select · Remove in the panel"
            : "Drag to pan · pinch/scroll zoom · WASD to move · two-finger rotate"}
        </p>
      )}
    </div>
  );
}
