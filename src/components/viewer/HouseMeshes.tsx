"use client";

import type { PlacedAsset, Room, Wall } from "@/types/scene";
import { getCatalogItem } from "@/lib/catalog";
import { useMemo } from "react";
import { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";

function wallTransform(wall: Wall) {
  const dx = wall.end[0] - wall.start[0];
  const dz = wall.end[1] - wall.start[1];
  const length = Math.hypot(dx, dz) || 0.01;
  const midX = (wall.start[0] + wall.end[0]) / 2;
  const midZ = (wall.start[1] + wall.end[1]) / 2;
  const angle = Math.atan2(dz, dx);
  return { length, midX, midZ, angle };
}

export function WallMesh({
  wall,
  selected,
  onSelect,
  /** Nearly invisible hit proxy over SketchUp — highlight only when selected. */
  hitProxy = false,
}: {
  wall: Wall;
  selected: boolean;
  onSelect: (id: string) => void;
  hitProxy?: boolean;
}) {
  if (wall.removed) return null;
  const { length, midX, midZ, angle } = wallTransform(wall);
  const opacity = hitProxy ? (selected ? 0.55 : 0.04) : selected ? 0.95 : 0.92;
  return (
    <mesh
      position={[midX, wall.height / 2, midZ]}
      rotation={[0, -angle, 0]}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onSelect(wall.id);
      }}
    >
      <boxGeometry
        args={[length, wall.height, Math.max(wall.thickness, hitProxy ? 0.18 : 0.08)]}
      />
      <meshStandardMaterial
        color={selected ? "#f59e0b" : wall.material.color}
        roughness={wall.material.roughness ?? 0.9}
        transparent
        opacity={opacity}
        depthWrite={!hitProxy || selected}
      />
    </mesh>
  );
}

export function RoomFloor({
  room,
  selected,
  onSelect,
}: {
  room: Room;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    // Shape lives in XY; mesh is rotated -90° about X so shapeY maps to world -Z.
    // Use -z so floors align with walls that use +z.
    room.polygon.forEach(([x, z], i) => {
      if (i === 0) s.moveTo(x, -z);
      else s.lineTo(x, -z);
    });
    s.closePath();
    return s;
  }, [room.polygon]);

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0.01, 0]}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onSelect(room.id);
      }}
    >
      <shapeGeometry args={[shape]} />
      <meshStandardMaterial
        color={selected ? "#93c5fd" : room.floorMaterial.color}
        roughness={room.floorMaterial.roughness ?? 0.8}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

export function CatalogAssetMesh({
  asset,
  selected,
  onSelect,
}: {
  asset: PlacedAsset;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const item = getCatalogItem(asset.catalogId);
  if (!item) return null;
  const [w, h, d] = item.size;
  const isRug = item.category === "rug";

  return (
    <group
      position={asset.position}
      rotation={[0, asset.rotationY, 0]}
      scale={asset.scale}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onSelect(asset.id);
      }}
    >
      <mesh position={[0, isRug ? h / 2 : h / 2, 0]}>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial
          color={selected ? "#38bdf8" : item.color}
          roughness={0.7}
        />
      </mesh>
      {item.accent && !isRug && (
        <mesh position={[0, h * 0.15, d * 0.35]}>
          <boxGeometry args={[w * 0.9, h * 0.2, d * 0.15]} />
          <meshStandardMaterial color={item.accent} />
        </mesh>
      )}
    </group>
  );
}
