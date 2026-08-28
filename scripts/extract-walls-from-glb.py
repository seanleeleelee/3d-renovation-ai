"""
Extract editable wall runs from the Bishan SketchUp GLB.
Same crop/flip/mm→m/origin as ReferenceShellModel. No invented walls.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import trimesh

ROOT = Path(__file__).resolve().parents[1]
GLB = ROOT / "public" / "models" / "bishan-ridges-4-room.glb"
OUT_JSON = ROOT / "public" / "models" / "bishan-ridges-4-room.walls.json"
PROJECT = ROOT / ".data" / "projects" / "2a9Hr3DWYD9z.json"

MIN_LEN_M = 0.6
MIN_HEIGHT_M = 2.0
MAX_THICK_M = 0.35
MERGE_LATERAL = 0.1
MERGE_GAP = 0.2
MERGE_ANGLE_DEG = 6.0
SNAP = 0.05


def snap(v: float) -> float:
    return round(v / SNAP) * SNAP


def transform_mesh(mesh: trimesh.Trimesh) -> trimesh.Trimesh:
    m = mesh.copy()
    m.apply_scale(0.001)
    mid_x = float((m.bounds[0, 0] + m.bounds[1, 0]) / 2)
    keep = m.triangles_center[:, 0] >= mid_x
    m.update_faces(keep)
    m.remove_unreferenced_vertices()
    m.apply_scale([-1.0, 1.0, 1.0])
    m.apply_translation(-m.bounds[0])
    return m


def extract_raw(mesh: trimesh.Trimesh) -> list[dict]:
    out: list[dict] = []
    for n, tri in zip(mesh.face_normals, mesh.triangles):
        if abs(float(n[1])) > 0.3:
            continue
        ys = tri[:, 1]
        height = float(ys.max() - ys.min())
        if height < MIN_HEIGHT_M:
            continue

        # Prefer nearly-horizontal edges (top/bottom of wall face) in XZ
        candidates = []
        for a, b in ((0, 1), (1, 2), (2, 0)):
            dy = abs(float(tri[b, 1] - tri[a, 1]))
            if dy > 0.25:
                continue
            p0 = tri[a, [0, 2]]
            p1 = tri[b, [0, 2]]
            length = float(np.linalg.norm(p1 - p0))
            if length < 0.25:
                continue
            candidates.append((length, p0, p1))
        if not candidates:
            continue
        candidates.sort(key=lambda x: -x[0])
        _, p0, p1 = candidates[0]
        length = float(np.linalg.norm(p1 - p0))
        if length < MIN_LEN_M * 0.5:
            continue

        n_xz = np.array([n[0], n[2]], dtype=float)
        nn = np.linalg.norm(n_xz)
        thick = 0.12
        if nn > 1e-6:
            n_xz /= nn
            proj = tri[:, [0, 2]] @ n_xz
            thick = float(np.clip(proj.max() - proj.min(), 0.08, MAX_THICK_M))

        out.append(
            {
                "a": np.array([snap(float(p0[0])), snap(float(p0[1]))], dtype=float),
                "b": np.array([snap(float(p1[0])), snap(float(p1[1]))], dtype=float),
                "height": float(min(height, 2.8)),
                "thickness": thick,
            }
        )
    return out


def ang_deg(u: np.ndarray, v: np.ndarray) -> float:
    u = u / (np.linalg.norm(u) + 1e-9)
    v = v / (np.linalg.norm(v) + 1e-9)
    return float(np.degrees(np.arccos(np.clip(abs(np.dot(u, v)), 0.0, 1.0))))


def intervals_mergeable(i0: float, i1: float, j0: float, j1: float) -> bool:
    if i0 > i1:
        i0, i1 = i1, i0
    if j0 > j1:
        j0, j1 = j1, j0
    gap = max(0.0, max(i0, j0) - min(i1, j1))
    return gap <= MERGE_GAP


def merge_segments(raw: list[dict], max_len: float) -> list[dict]:
    segs = []
    for s in raw:
        if np.linalg.norm(s["b"] - s["a"]) < MIN_LEN_M * 0.5:
            continue
        segs.append(s)

    parent = list(range(len(segs)))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def union(i: int, j: int) -> None:
        ri, rj = find(i), find(j)
        if ri != rj:
            parent[rj] = ri

    for i, s in enumerate(segs):
        di = s["b"] - s["a"]
        for j in range(i + 1, len(segs)):
            o = segs[j]
            dj = o["b"] - o["a"]
            if ang_deg(di, dj) > MERGE_ANGLE_DEG:
                continue
            d = di / (np.linalg.norm(di) + 1e-9)
            # lateral distance of o.a to line s
            lateral = abs(float((o["a"] - s["a"])[0] * d[1] - (o["a"] - s["a"])[1] * d[0]))
            if lateral > MERGE_LATERAL:
                continue
            i0, i1 = float(s["a"] @ d), float(s["b"] @ d)
            j0, j1 = float(o["a"] @ d), float(o["b"] @ d)
            if not intervals_mergeable(i0, i1, j0, j1):
                continue
            union(i, j)

    groups: dict[int, list[dict]] = {}
    for i, s in enumerate(segs):
        groups.setdefault(find(i), []).append(s)

    merged: list[dict] = []
    for group in groups.values():
        # direction from longest member
        longest = max(group, key=lambda s: float(np.linalg.norm(s["b"] - s["a"])))
        d = longest["b"] - longest["a"]
        d = d / (np.linalg.norm(d) + 1e-9)
        origin = longest["a"]
        dots = []
        for s in group:
            dots.append(float((s["a"] - origin) @ d))
            dots.append(float((s["b"] - origin) @ d))
        lo, hi = min(dots), max(dots)
        a = origin + d * lo
        b = origin + d * hi
        length = float(hi - lo)
        if length < MIN_LEN_M or length > max_len:
            # if overlong, keep members separately instead
            if length > max_len:
                for s in group:
                    ln = float(np.linalg.norm(s["b"] - s["a"]))
                    if MIN_LEN_M <= ln <= max_len:
                        merged.append(s)
                continue
            continue
        merged.append(
            {
                "a": a,
                "b": b,
                "height": max(s["height"] for s in group),
                "thickness": max(s["thickness"] for s in group),
            }
        )
    return merged


def to_walls(segs: list[dict]) -> list[dict]:
    paint = {"color": "#f3f0ea", "roughness": 0.9}
    walls = []
    for i, s in enumerate(segs, start=1):
        a = [round(float(s["a"][0]), 3), round(float(s["a"][1]), 3)]
        b = [round(float(s["b"][0]), 3), round(float(s["b"][1]), 3)]
        if (a[0], a[1]) > (b[0], b[1]):
            a, b = b, a
        walls.append(
            {
                "id": f"skp-wall-{i}",
                "roomIds": ["room-unit"],
                "start": a,
                "end": b,
                "height": round(float(s["height"]), 2),
                "thickness": round(float(min(s["thickness"], MAX_THICK_M)), 3),
                "material": paint,
            }
        )
    # dedupe nearly identical
    uniq = []
    seen = set()
    for w in walls:
        key = (w["start"][0], w["start"][1], w["end"][0], w["end"][1])
        if key in seen:
            continue
        seen.add(key)
        uniq.append(w)
    return uniq


def main() -> None:
    print("Loading", GLB)
    loaded = trimesh.load(GLB, force="scene")
    parts = [g for g in loaded.dump() if isinstance(g, trimesh.Trimesh)]
    mesh = trimesh.util.concatenate(parts)
    mesh = transform_mesh(mesh)
    print("bounds m", mesh.bounds[0], "->", mesh.bounds[1], "extents", mesh.extents)

    max_len = float(max(mesh.extents[0], mesh.extents[2]) * 1.05)
    raw = extract_raw(mesh)
    # Drop impossible segments before merge
    raw = [
        s
        for s in raw
        if MIN_LEN_M * 0.5 <= float(np.linalg.norm(s["b"] - s["a"])) <= max_len
    ]
    print("raw", len(raw))
    merged = merge_segments(raw, max_len=max_len)
    print("merged", len(merged))
    walls = to_walls(merged)
    # Final length clamp
    walls = [
        w
        for w in walls
        if MIN_LEN_M
        <= float(
            np.hypot(w["end"][0] - w["start"][0], w["end"][1] - w["start"][1])
        )
        <= max_len
    ]
    print("walls", len(walls))

    x0, z0 = float(mesh.bounds[0, 0]), float(mesh.bounds[0, 2])
    x1, z1 = float(mesh.bounds[1, 0]), float(mesh.bounds[1, 2])
    room = {
        "id": "room-unit",
        "name": "Unit",
        "polygon": [[x0, z0], [x1, z0], [x1, z1], [x0, z1]],
        "ceilingHeight": 2.7,
        "floorMaterial": {"color": "#cfc7b8", "roughness": 0.75},
    }
    payload = {"wallCount": len(walls), "walls": walls, "room": room}
    OUT_JSON.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    project = json.loads(PROJECT.read_text(encoding="utf-8"))
    cx = (x0 + x1) / 2
    cz = (z0 + z1) / 2
    span = float(max(x1 - x0, z1 - z0, 8))
    project["scene"]["rooms"] = [room]
    project["scene"]["walls"] = walls
    project["scene"]["assets"] = []
    project["scene"]["proposals"] = []
    project["scene"]["notes"] = (
        "Editable walls from SketchUp GLB only — no floorplan-invented walls."
    )
    project["scene"]["camera"] = {
        "mode": "orbit",
        "position": [cx + span * 0.65, span * 0.5, cz + span * 0.65],
        "target": [cx, 0, cz],
    }
    project["shellModelUrl"] = "/models/bishan-ridges-4-room.glb"
    PROJECT.write_text(json.dumps(project, indent=2), encoding="utf-8")
    print("saved project walls", len(walls))


if __name__ == "__main__":
    main()
