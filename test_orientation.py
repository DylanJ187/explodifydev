"""
Orientation debug script.
Renders the model from multiple known camera directions and saves labeled images.
Run from /tmp/Explodify: python test_orientation.py <path_to_obj>
"""
import sys
import math
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).parent))

from pipeline.format_loader import load_assembly
from pipeline.phase1_geometry import GeometryAnalyzer
from pipeline.phase2_snapshots import SnapshotRenderer, render_preview_frame

OBJ_PATH = sys.argv[1] if len(sys.argv) > 1 else "/Users/dylanjupp/Downloads/Antique Camera/tinker.obj"
OUT_DIR = Path("/tmp/orientation_test")
OUT_DIR.mkdir(parents=True, exist_ok=True)

print(f"Loading: {OBJ_PATH}")
named_meshes = load_assembly(OBJ_PATH)
print(f"Loaded {len(named_meshes)} components")

analyzer = GeometryAnalyzer()
named_meshes = analyzer.reorient(named_meshes)
print("Reoriented")

meshes = [nm.mesh for nm in named_meshes]
all_verts = np.vstack([m.vertices for m in meshes])
extents = all_verts.max(axis=0) - all_verts.min(axis=0)
center = (all_verts.max(axis=0) + all_verts.min(axis=0)) / 2
print(f"Extents (X,Y,Z): {extents}")
print(f"Center: {center}")

# Test directions — six faces + the default diagonal
test_directions = {
    "front_Z+":    np.array([ 0.0,  0.0,  1.0]),
    "back_Z-":     np.array([ 0.0,  0.0, -1.0]),
    "right_X+":    np.array([ 1.0,  0.0,  0.0]),
    "left_X-":     np.array([-1.0,  0.0,  0.0]),
    "top_Y+":      np.array([ 0.0,  1.0,  0.0]),
    "bottom_Y-":   np.array([ 0.0, -1.0,  0.0]),
    "default_diag": np.array([0.3,  0.3,  1.0]),
    # Typical Three.js fitCameraToModel initial position
    "threejs_init": np.array([0.4,  0.3,  1.0]),
}

renderer = SnapshotRenderer()

print("\nRendering test frames...")
for name, direction in test_directions.items():
    img = render_preview_frame(meshes, direction, resolution=(512, 384))
    out_path = OUT_DIR / f"{name}.png"
    img.save(str(out_path))
    print(f"  Saved: {out_path}")

print(f"\nAll test frames saved to {OUT_DIR}")
print("Compare these to what Three.js shows for each direction.")
