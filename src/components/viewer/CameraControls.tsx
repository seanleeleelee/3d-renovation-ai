"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { MapControls, PerspectiveCamera } from "@react-three/drei";
import * as THREE from "three";

const EYE_HEIGHT = 1.55;
const WALK_SPEED = 3.2;
const LOOK_SENS_MOUSE = 0.0022;
const LOOK_SENS_TOUCH = 0.0035;

type Keys = Record<string, boolean>;

function useKeyFlags() {
  const keys = useRef<Keys>({});
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      keys.current[e.code] = true;
    };
    const up = (e: KeyboardEvent) => {
      keys.current[e.code] = false;
    };
    const blur = () => {
      keys.current = {};
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);
  return keys;
}

/** House overview: pan/dolly around freely (not locked to orbiting a fixed point). */
export function ExploreCamera({
  position,
  target,
}: {
  position: [number, number, number];
  target: [number, number, number];
}) {
  const keys = useKeyFlags();
  const { camera } = useThree();
  const controlsRef = useRef<{
    target: THREE.Vector3;
    object: THREE.Camera;
    update: () => void;
  } | null>(null);

  const px = position[0];
  const py = position[1];
  const pz = position[2];
  const tx = target[0];
  const ty = target[1];
  const tz = target[2];

  // Remount props alone won't move MapControls after first frame — sync on scene change.
  useEffect(() => {
    camera.position.set(px, py, pz);
    const controls = controlsRef.current;
    if (controls) {
      controls.target.set(tx, ty, tz);
      controls.update();
    }
  }, [camera, px, py, pz, tx, ty, tz]);

  useFrame((_, dt) => {
    const controls = controlsRef.current;
    if (!controls) return;
    const k = keys.current;
    const forward =
      (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
    const strafe =
      (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
    if (!forward && !strafe) return;

    const cam = controls.object as THREE.PerspectiveCamera;
    const offset = new THREE.Vector3().subVectors(cam.position, controls.target);
    const flatForward = new THREE.Vector3(offset.x, 0, offset.z);
    if (flatForward.lengthSq() < 1e-6) flatForward.set(0, 0, -1);
    flatForward.normalize();
    const right = new THREE.Vector3()
      .crossVectors(flatForward, new THREE.Vector3(0, 1, 0))
      .normalize();

    const step = WALK_SPEED * 1.6 * dt;
    const move = new THREE.Vector3()
      .addScaledVector(flatForward, -forward * step)
      .addScaledVector(right, strafe * step);
    cam.position.add(move);
    controls.target.add(move);
    controls.update();
  });

  return (
    <>
      <PerspectiveCamera makeDefault position={position} fov={50} near={0.05} far={500} />
      <MapControls
        ref={controlsRef as never}
        makeDefault
        target={target}
        enableDamping
        dampingFactor={0.08}
        maxPolarAngle={Math.PI * 0.48}
        minDistance={1.5}
        maxDistance={80}
        screenSpacePanning
        // One-finger drag pans on touch; rotate with two fingers / right mouse
        enableRotate
      />
    </>
  );
}

export type JoystickState = { x: number; y: number };

/** First-person walk: drag to look, WASD / virtual stick to move. */
export function WalkCamera({
  spawn,
  joystick,
}: {
  spawn: [number, number, number];
  joystick: React.RefObject<JoystickState>;
}) {
  const { camera, gl } = useThree();
  const keys = useKeyFlags();
  const yaw = useRef(0);
  const pitch = useRef(0);
  const pos = useRef(new THREE.Vector3(spawn[0], EYE_HEIGHT, spawn[2]));
  const dragging = useRef(false);
  const last = useRef({ x: 0, y: 0 });
  const primed = useRef(false);

  useEffect(() => {
    pos.current.set(spawn[0], EYE_HEIGHT, spawn[2]);
    yaw.current = 0;
    pitch.current = 0;
    primed.current = false;
  }, [spawn[0], spawn[2]]);

  useEffect(() => {
    const el = gl.domElement;

    const onDown = (e: PointerEvent) => {
      // Ignore UI touches that start outside the canvas
      dragging.current = true;
      last.current = { x: e.clientX, y: e.clientY };
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      const sens = e.pointerType === "touch" ? LOOK_SENS_TOUCH : LOOK_SENS_MOUSE;
      const dx = e.clientX - last.current.x;
      const dy = e.clientY - last.current.y;
      last.current = { x: e.clientX, y: e.clientY };
      yaw.current -= dx * sens;
      pitch.current -= dy * sens;
      pitch.current = Math.max(-1.2, Math.min(1.2, pitch.current));
    };
    const onUp = (e: PointerEvent) => {
      dragging.current = false;
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
  }, [gl]);

  useFrame((_, dt) => {
    if (!primed.current) {
      camera.position.copy(pos.current);
      primed.current = true;
    }

    const euler = new THREE.Euler(pitch.current, yaw.current, 0, "YXZ");
    camera.quaternion.setFromEuler(euler);

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    forward.y = 0;
    if (forward.lengthSq() > 1e-6) forward.normalize();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    right.y = 0;
    if (right.lengthSq() > 1e-6) right.normalize();

    const k = keys.current;
    let mx =
      (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
    let mz =
      (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);

    const stick = joystick.current;
    if (stick && (Math.abs(stick.x) > 0.08 || Math.abs(stick.y) > 0.08)) {
      mx += stick.x;
      mz += -stick.y;
    }

    const len = Math.hypot(mx, mz);
    if (len > 1) {
      mx /= len;
      mz /= len;
    }

    if (mx || mz) {
      const step = WALK_SPEED * dt;
      pos.current.addScaledVector(forward, mz * step);
      pos.current.addScaledVector(right, mx * step);
      pos.current.y = EYE_HEIGHT;
    }

    camera.position.lerp(pos.current, 1);
  });

  return (
    <PerspectiveCamera makeDefault position={spawn} fov={72} near={0.05} far={200} />
  );
}
