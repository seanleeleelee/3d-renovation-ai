"use client";

import { useLayoutEffect, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { Wall } from "@/types/scene";

type KeepHalf = "min-x" | "max-x";

function distPointToSegment(
  p: THREE.Vector2,
  a: THREE.Vector2,
  b: THREE.Vector2,
): number {
  const ab = b.clone().sub(a);
  const t = Math.max(
    0,
    Math.min(1, p.clone().sub(a).dot(ab) / (ab.lengthSq() + 1e-9)),
  );
  return p.clone().sub(a).sub(ab.multiplyScalar(t)).length();
}

/**
 * SketchUp twin-block GLB: one unit, flipped, mm→m, seated on plan origin.
 * Optional: hide meshes near removed editable walls.
 */
export function ReferenceShellModel({
  url,
  opacity = 1,
  sourceUnit = "mm",
  keepHalf = "max-x",
  flip = true,
  removedWalls = [],
}: {
  url: string;
  opacity?: number;
  sourceUnit?: "mm" | "m";
  keepHalf?: KeepHalf;
  flip?: boolean;
  removedWalls?: Wall[];
}) {
  const { scene } = useGLTF(url);
  const root = useMemo(() => scene.clone(true), [scene]);

  useLayoutEffect(() => {
    root.position.set(0, 0, 0);
    root.rotation.set(0, 0, 0);
    root.scale.set(1, 1, 1);
    root.updateMatrixWorld(true);

    const s = sourceUnit === "mm" ? 0.001 : 1;
    root.scale.setScalar(s);
    root.updateMatrixWorld(true);

    const full = new THREE.Box3().setFromObject(root);
    if (full.isEmpty()) return;
    const midX = (full.min.x + full.max.x) / 2;

    const doomed: THREE.Object3D[] = [];
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      mesh.geometry.computeBoundingBox();
      const bb = mesh.geometry.boundingBox;
      if (!bb) return;
      const c = bb.getCenter(new THREE.Vector3());
      mesh.localToWorld(c);
      const onMinSide = c.x < midX;
      if (keepHalf === "max-x" ? onMinSide : !onMinSide) doomed.push(mesh);
    });
    for (const mesh of doomed) {
      mesh.removeFromParent();
      const m = mesh as THREE.Mesh;
      m.geometry?.dispose();
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) mat?.dispose?.();
    }

    root.updateMatrixWorld(true);

    if (flip) {
      root.scale.x *= -1;
      root.updateMatrixWorld(true);
    }

    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.visible = true;
      const mats = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      for (const mat of mats) {
        if (!mat) continue;
        const m = mat as THREE.MeshStandardMaterial;
        if ("color" in m && m.color && m.color.getHex() === 0x000000) {
          m.color.set("#f3f0ea");
        }
        if ("transparent" in m) {
          m.transparent = opacity < 0.99;
          m.opacity = opacity;
          m.depthWrite = opacity >= 0.99;
          m.needsUpdate = true;
        }
        if ("side" in m) m.side = THREE.DoubleSide;
      }
    });

    const box = new THREE.Box3().setFromObject(root);
    if (box.isEmpty()) return;
    root.position.x += -box.min.x;
    root.position.y += -box.min.y;
    root.position.z += -box.min.z;
    root.updateMatrixWorld(true);

    // Hide GLB bits that sit on removed wall runs
    if (removedWalls.length) {
      const segs = removedWalls
        .filter((w) => w.removed)
        .map((w) => ({
          a: new THREE.Vector2(w.start[0], w.start[1]),
          b: new THREE.Vector2(w.end[0], w.end[1]),
        }));
      root.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh || !mesh.geometry) return;
        mesh.geometry.computeBoundingBox();
        const bb = mesh.geometry.boundingBox;
        if (!bb) return;
        const c = bb.getCenter(new THREE.Vector3());
        mesh.localToWorld(c);
        const p = new THREE.Vector2(c.x, c.z);
        for (const seg of segs) {
          if (distPointToSegment(p, seg.a, seg.b) < 0.4) {
            mesh.visible = false;
            break;
          }
        }
      });
    }
  }, [root, opacity, sourceUnit, keepHalf, flip, removedWalls]);

  return <primitive object={root} />;
}

export function preloadShellModel(url: string) {
  useGLTF.preload(url);
}
