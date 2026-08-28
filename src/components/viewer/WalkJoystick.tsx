"use client";

import { useRef } from "react";
import type { JoystickState } from "@/components/viewer/CameraControls";

/** On-screen thumbstick for mobile walk movement. */
export function WalkJoystick({
  stateRef,
}: {
  stateRef: React.RefObject<JoystickState>;
}) {
  const origin = useRef<{ x: number; y: number } | null>(null);
  const knob = useRef<HTMLDivElement>(null);

  function setStick(x: number, y: number) {
    if (stateRef.current) {
      stateRef.current.x = x;
      stateRef.current.y = y;
    }
    if (knob.current) {
      knob.current.style.transform = `translate(${x * 28}px, ${y * 28}px)`;
    }
  }

  return (
    <div
      className="pointer-events-auto absolute bottom-28 left-4 z-20 h-28 w-28 touch-none select-none rounded-full border border-white/25 bg-black/35 backdrop-blur-sm md:bottom-8"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        const rect = e.currentTarget.getBoundingClientRect();
        origin.current = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        };
      }}
      onPointerMove={(e) => {
        if (!origin.current) return;
        const dx = e.clientX - origin.current.x;
        const dy = e.clientY - origin.current.y;
        const max = 42;
        const len = Math.hypot(dx, dy) || 1;
        const scale = Math.min(1, max / len);
        setStick((dx * scale) / max, (dy * scale) / max);
      }}
      onPointerUp={() => {
        origin.current = null;
        setStick(0, 0);
      }}
      onPointerCancel={() => {
        origin.current = null;
        setStick(0, 0);
      }}
    >
      <div
        ref={knob}
        className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/35 shadow-lg"
      />
      <span className="pointer-events-none absolute -bottom-5 left-0 right-0 text-center text-[10px] text-white/50">
        Move
      </span>
    </div>
  );
}
