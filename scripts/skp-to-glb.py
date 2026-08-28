"""Convert a SketchUp .skp to public/models/*.glb using openskp."""
from __future__ import annotations

import argparse
import os
import shutil
from pathlib import Path

from openskp import SkpFile
from openskp.export import glb


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("skp", type=Path, help="Path to .skp file")
    parser.add_argument(
        "--name",
        default="bishan-ridges-4-room",
        help="Output basename under public/models/",
    )
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[1]
    out_dir = root / "public" / "models"
    out_dir.mkdir(parents=True, exist_ok=True)

    skp_copy = out_dir / f"{args.name}.skp"
    if args.skp.resolve() != skp_copy.resolve():
        shutil.copy2(args.skp, skp_copy)

    out_glb = out_dir / f"{args.name}.glb"
    print(f"Parsing {skp_copy} …")
    skp = SkpFile.open(str(skp_copy))
    skp.parse()
    print(f"Exporting {out_glb} …")
    glb.export(skp, str(out_glb))
    print(f"Done ({os.path.getsize(out_glb)} bytes) → /models/{args.name}.glb")


if __name__ == "__main__":
    main()
