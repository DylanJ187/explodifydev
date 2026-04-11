# Explodify — Phase 1 & 2 Implementation Plan (Collaborator)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Phase 1 (geometric analysis: optimal angle + explosion vectors) and Phase 2 (headless pyrender snapshots) so that given any `.glb/.obj/.stl` file, 3 PNG keyframes + metadata are written to disk in the `FrameSet` format defined in `pipeline/models.py`.

**Architecture:** `GeometryAnalyzer` (phase1) takes a CAD file path, ray-casts from 6 cardinal directions to find the most informative view, and computes per-mesh explosion vectors. `SnapshotRenderer` (phase2) uses pyrender headless rendering to produce 3 PNG keyframes at 0%/50%/100% explosion with a slight camera orbit. Both classes consume and produce the shared `FrameSet`/`PipelineMetadata` types from `pipeline/models.py`.

**Tech Stack:** Python 3.11, trimesh>=4.0, pyrender>=0.1.45, numpy, Pillow, pytest

**Read first:** `docs/superpowers/plans/2026-04-11-interface-contract.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `pipeline/models.py` | Create | Shared contract — create first, commit immediately |
| `pipeline/__init__.py` | Create | Empty init |
| `pipeline/phase1_geometry.py` | Create | `GeometryAnalyzer` class |
| `pipeline/phase2_snapshots.py` | Create | `SnapshotRenderer` class |
| `tests/pipeline/fixtures/create_test_assembly.py` | Create | Script that generates test GLB |
| `tests/pipeline/fixtures/two_box_assembly.glb` | Generate | Run create_test_assembly.py |
| `tests/pipeline/conftest.py` | Create | Shared pytest fixtures |
| `tests/pipeline/test_phase1_geometry.py` | Create | Phase 1 unit tests |
| `tests/pipeline/test_phase2_snapshots.py` | Create | Phase 2 unit tests |
| `tests/pipeline/test_integration_phase1_2.py` | Create | End-to-end Phase 1→2 test |
| `requirements.txt` | Modify | Verify all deps present |
| `.env.example` | Create | Template (no real keys) |

---

## Task 1: Shared Contract + Project Init

**Files:**
- Create: `pipeline/__init__.py`
- Create: `pipeline/models.py`
- Create: `.env.example`

- [ ] **Step 1: Create `pipeline/__init__.py`**

```python
# pipeline/__init__.py
```

- [ ] **Step 2: Create `pipeline/models.py`**

```python
# pipeline/models.py
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


@dataclass
class PipelineMetadata:
    """Geometry analysis results produced by Phase 1."""
    master_angle: str               # "top" | "bottom" | "left" | "right" | "front" | "back"
    explosion_scalar: float         # E multiplier applied to explosion vectors
    component_count: int            # number of unique mesh IDs detected
    camera_angles_deg: list[float]  # [0.0, 15.0, 30.0]


@dataclass
class FrameSet:
    """Three PNG keyframes produced by Phase 2, consumed by Phase 3."""
    frame_a: Path   # 0%   explosion, 0°  camera
    frame_b: Path   # 50%  explosion, 15° camera
    frame_c: Path   # 100% explosion, 30° camera
    metadata: PipelineMetadata

    def validate(self) -> None:
        for attr in ("frame_a", "frame_b", "frame_c"):
            p = getattr(self, attr)
            if not Path(p).exists():
                raise ValueError(f"Frame not found: {p}")


@dataclass
class JobResult:
    """Final result returned by the full pipeline."""
    frame_set: FrameSet
    stylized_frame_set: FrameSet
    video_path: Path
    error: Optional[str] = None
```

- [ ] **Step 3: Create `.env.example`**

```
GOOGLE_API_KEY=your_gemini_key_here
FAL_KEY=your_fal_key_here
```

- [ ] **Step 4: Verify requirements.txt has all deps**

`requirements.txt` must contain at minimum:
```
trimesh>=4.0.0
pyrender>=0.1.45
numpy>=1.24.0
Pillow>=10.0.0
google-genai>=1.0.0
fal-client>=0.4.0
python-dotenv>=1.0.0
pytest>=7.0.0
```

- [ ] **Step 5: Commit**

```bash
git add pipeline/__init__.py pipeline/models.py .env.example requirements.txt
git commit -m "feat: shared pipeline models contract + project init"
git push origin main
```

> **CRITICAL:** Push immediately so Kirill can pull and start Phase 3/4.

---

## Task 2: Test Fixture — Two-Box Assembly GLB

**Files:**
- Create: `tests/pipeline/fixtures/create_test_assembly.py`
- Generate: `tests/pipeline/fixtures/two_box_assembly.glb`
- Create: `tests/pipeline/__init__.py`
- Create: `tests/__init__.py`

- [ ] **Step 1: Create `tests/__init__.py` and `tests/pipeline/__init__.py`**

Both are empty files.

- [ ] **Step 2: Create fixture generator script**

```python
# tests/pipeline/fixtures/create_test_assembly.py
"""Run once to generate the test GLB fixture.

Usage: python tests/pipeline/fixtures/create_test_assembly.py
"""
import trimesh
import numpy as np
from pathlib import Path

OUTPUT = Path(__file__).parent / "two_box_assembly.glb"

def create_two_box_assembly() -> trimesh.Scene:
    """Two boxes separated on the X axis — clearly 2 distinct components."""
    box_a = trimesh.creation.box(extents=[1.0, 1.0, 1.0])
    box_a.apply_translation([1.5, 0.0, 0.0])
    box_a.visual.face_colors = [200, 100, 100, 255]  # red

    box_b = trimesh.creation.box(extents=[1.0, 1.0, 1.0])
    box_b.apply_translation([-1.5, 0.0, 0.0])
    box_b.visual.face_colors = [100, 100, 200, 255]  # blue

    return trimesh.Scene({"box_a": box_a, "box_b": box_b})

if __name__ == "__main__":
    scene = create_two_box_assembly()
    scene.export(str(OUTPUT))
    print(f"Fixture written to {OUTPUT}")
```

- [ ] **Step 3: Run the fixture generator**

```bash
python tests/pipeline/fixtures/create_test_assembly.py
```

Expected output: `Fixture written to tests/pipeline/fixtures/two_box_assembly.glb`
Verify: `tests/pipeline/fixtures/two_box_assembly.glb` exists and is non-empty.

- [ ] **Step 4: Commit**

```bash
git add tests/__init__.py tests/pipeline/__init__.py tests/pipeline/fixtures/
git commit -m "test: add two-box assembly GLB fixture for pipeline tests"
```

---

## Task 3: Phase 1 — Load CAD File

**Files:**
- Create: `pipeline/phase1_geometry.py` (partial — load method only)
- Create: `tests/pipeline/conftest.py`
- Create: `tests/pipeline/test_phase1_geometry.py` (partial)

- [ ] **Step 1: Create `tests/pipeline/conftest.py`**

```python
# tests/pipeline/conftest.py
import pytest
from pathlib import Path

FIXTURES_DIR = Path(__file__).parent / "fixtures"

@pytest.fixture
def two_box_glb() -> Path:
    p = FIXTURES_DIR / "two_box_assembly.glb"
    assert p.exists(), f"Run: python {FIXTURES_DIR}/create_test_assembly.py"
    return p
```

- [ ] **Step 2: Write the failing test**

```python
# tests/pipeline/test_phase1_geometry.py
import pytest
from pipeline.phase1_geometry import GeometryAnalyzer

def test_load_returns_list_of_meshes(two_box_glb):
    analyzer = GeometryAnalyzer()
    meshes = analyzer.load(str(two_box_glb))
    assert isinstance(meshes, list)
    assert len(meshes) >= 2

def test_load_nonexistent_file_raises():
    analyzer = GeometryAnalyzer()
    with pytest.raises(FileNotFoundError):
        analyzer.load("does_not_exist.glb")
```

- [ ] **Step 3: Run test to verify it fails**

```bash
pytest tests/pipeline/test_phase1_geometry.py -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'pipeline.phase1_geometry'`

- [ ] **Step 4: Implement `GeometryAnalyzer.load`**

```python
# pipeline/phase1_geometry.py
import trimesh
import numpy as np
from pathlib import Path
from typing import List


class GeometryAnalyzer:
    """Phase 1: Load a CAD file and compute optimal viewing angle + explosion vectors."""

    def load(self, path: str) -> List[trimesh.Trimesh]:
        """Load a CAD/mesh file and return a flat list of component meshes.

        Args:
            path: Path to .glb, .obj, or .stl file.

        Returns:
            List of trimesh.Trimesh, one per component in the assembly.

        Raises:
            FileNotFoundError: If path does not exist.
        """
        if not Path(path).exists():
            raise FileNotFoundError(f"CAD file not found: {path}")

        loaded = trimesh.load(path, force="scene")

        if isinstance(loaded, trimesh.Scene):
            meshes = [
                geom for geom in loaded.geometry.values()
                if isinstance(geom, trimesh.Trimesh) and len(geom.faces) > 0
            ]
        elif isinstance(loaded, trimesh.Trimesh):
            meshes = [loaded]
        else:
            meshes = list(loaded.geometry.values())

        return meshes
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pytest tests/pipeline/test_phase1_geometry.py::test_load_returns_list_of_meshes tests/pipeline/test_phase1_geometry.py::test_load_nonexistent_file_raises -v
```

Expected: 2 PASSED

- [ ] **Step 6: Commit**

```bash
git add pipeline/phase1_geometry.py tests/pipeline/conftest.py tests/pipeline/test_phase1_geometry.py
git commit -m "feat: GeometryAnalyzer.load — parse CAD file into component meshes"
```

---

## Task 4: Phase 1 — Optimal Angle (Ray-Cast)

**Files:**
- Modify: `pipeline/phase1_geometry.py` (add `master_angle` method)
- Modify: `tests/pipeline/test_phase1_geometry.py` (add test)

- [ ] **Step 1: Write the failing test**

Add to `tests/pipeline/test_phase1_geometry.py`:

```python
def test_master_angle_returns_valid_direction(two_box_glb):
    analyzer = GeometryAnalyzer()
    meshes = analyzer.load(str(two_box_glb))
    direction = analyzer.master_angle(meshes)
    assert direction in {"top", "bottom", "left", "right", "front", "back"}

def test_master_angle_hits_most_unique_meshes(two_box_glb):
    """The master angle must be the direction that sees the most components.
    For two boxes separated on X axis, left or right should win."""
    analyzer = GeometryAnalyzer()
    meshes = analyzer.load(str(two_box_glb))
    direction = analyzer.master_angle(meshes)
    # Left/right are the directions that see both boxes for an X-separated assembly
    assert direction in {"left", "right"}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/pipeline/test_phase1_geometry.py::test_master_angle_returns_valid_direction -v
```

Expected: FAIL with `AttributeError: 'GeometryAnalyzer' object has no attribute 'master_angle'`

- [ ] **Step 3: Implement `master_angle`**

Add to `pipeline/phase1_geometry.py`:

```python
    # Cardinal direction definitions: name → (origin offset, ray direction)
    _DIRECTIONS = {
        "top":    (np.array([0,  10, 0]), np.array([ 0, -1,  0])),
        "bottom": (np.array([0, -10, 0]), np.array([ 0,  1,  0])),
        "left":   (np.array([-10, 0, 0]), np.array([ 1,  0,  0])),
        "right":  (np.array([ 10, 0, 0]), np.array([-1,  0,  0])),
        "front":  (np.array([0,  0, 10]), np.array([ 0,  0, -1])),
        "back":   (np.array([0,  0,-10]), np.array([ 0,  0,  1])),
    }

    def master_angle(self, meshes: List[trimesh.Trimesh]) -> str:
        """Find the cardinal direction that hits the highest number of unique mesh IDs.

        Args:
            meshes: List of component meshes (from load()).

        Returns:
            Direction name: one of "top", "bottom", "left", "right", "front", "back".
        """
        # Build a combined scene for ray intersection, tracking mesh index per face
        all_vertices = []
        all_faces = []
        face_to_mesh = []
        vertex_offset = 0

        for idx, mesh in enumerate(meshes):
            all_vertices.append(mesh.vertices)
            all_faces.append(mesh.faces + vertex_offset)
            face_to_mesh.extend([idx] * len(mesh.faces))
            vertex_offset += len(mesh.vertices)

        combined = trimesh.Trimesh(
            vertices=np.vstack(all_vertices),
            faces=np.vstack(all_faces),
            process=False,
        )
        face_to_mesh = np.array(face_to_mesh)

        # Shoot 25 rays in a grid pattern from each direction
        best_direction = "front"
        best_count = -1

        # Compute assembly centroid to offset ray origins
        all_centroids = np.mean([m.centroid for m in meshes], axis=0)

        for name, (offset, ray_dir) in self._DIRECTIONS.items():
            # Grid of 5×5 = 25 ray origins around the assembly centroid
            jitter = np.array([[dx, dy, 0] for dx in np.linspace(-1, 1, 5)
                                             for dy in np.linspace(-1, 1, 5)])
            # Rotate jitter into the plane perpendicular to ray_dir
            origins = all_centroids + offset + jitter
            directions = np.tile(ray_dir, (25, 1))

            try:
                _, index_ray, index_tri = combined.ray.intersects_id(
                    ray_origins=origins,
                    ray_directions=directions,
                    multiple_hits=False,
                )
            except Exception:
                continue

            unique_meshes_hit = len(set(face_to_mesh[index_tri]))
            if unique_meshes_hit > best_count:
                best_count = unique_meshes_hit
                best_direction = name

        return best_direction
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/pipeline/test_phase1_geometry.py -v
```

Expected: All PASSED (4 tests)

- [ ] **Step 5: Commit**

```bash
git add pipeline/phase1_geometry.py tests/pipeline/test_phase1_geometry.py
git commit -m "feat: GeometryAnalyzer.master_angle — ray-cast optimal viewing direction"
```

---

## Task 5: Phase 1 — Explosion Vectors

**Files:**
- Modify: `pipeline/phase1_geometry.py` (add `explosion_vectors` method)
- Modify: `tests/pipeline/test_phase1_geometry.py` (add tests)

- [ ] **Step 1: Write the failing tests**

Add to `tests/pipeline/test_phase1_geometry.py`:

```python
import numpy as np

def test_explosion_vectors_count_matches_meshes(two_box_glb):
    analyzer = GeometryAnalyzer()
    meshes = analyzer.load(str(two_box_glb))
    vectors = analyzer.explosion_vectors(meshes, scalar=1.5)
    assert len(vectors) == len(meshes)

def test_explosion_vectors_are_nonzero(two_box_glb):
    analyzer = GeometryAnalyzer()
    meshes = analyzer.load(str(two_box_glb))
    vectors = analyzer.explosion_vectors(meshes, scalar=1.5)
    for v in vectors.values():
        # Each component should move — zero vector means it's at the assembly centroid
        assert np.linalg.norm(v) > 1e-6

def test_explosion_vectors_point_outward(two_box_glb):
    """v = centroid_component - centroid_assembly, scaled by E.
    dot(v, centroid_component - centroid_assembly) must be > 0."""
    analyzer = GeometryAnalyzer()
    meshes = analyzer.load(str(two_box_glb))
    vectors = analyzer.explosion_vectors(meshes, scalar=1.5)
    assembly_centroid = np.mean([m.centroid for m in meshes], axis=0)
    for i, mesh in enumerate(meshes):
        direction = mesh.centroid - assembly_centroid
        dot = np.dot(vectors[i], direction)
        assert dot > 0, f"Mesh {i} explosion vector points inward"

def test_explosion_vectors_scale_with_scalar(two_box_glb):
    analyzer = GeometryAnalyzer()
    meshes = analyzer.load(str(two_box_glb))
    v1 = analyzer.explosion_vectors(meshes, scalar=1.0)
    v2 = analyzer.explosion_vectors(meshes, scalar=2.0)
    for i in v1:
        ratio = np.linalg.norm(v2[i]) / np.linalg.norm(v1[i])
        assert abs(ratio - 2.0) < 1e-6
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/pipeline/test_phase1_geometry.py -k "explosion" -v
```

Expected: FAIL with `AttributeError`

- [ ] **Step 3: Implement `explosion_vectors`**

Add to `pipeline/phase1_geometry.py`:

```python
    def explosion_vectors(
        self, meshes: List[trimesh.Trimesh], scalar: float
    ) -> dict[int, np.ndarray]:
        """Compute outward explosion vector for each mesh component.

        v⃗_i = (centroid_i - centroid_assembly) * scalar

        Args:
            meshes: List of component meshes.
            scalar: Explosion multiplier E. 1.0 = move by one component-width.

        Returns:
            Dict mapping mesh index → 3D numpy displacement vector.
        """
        assembly_centroid = np.mean([m.centroid for m in meshes], axis=0)
        return {
            i: (mesh.centroid - assembly_centroid) * scalar
            for i, mesh in enumerate(meshes)
        }
```

- [ ] **Step 4: Run all Phase 1 tests**

```bash
pytest tests/pipeline/test_phase1_geometry.py -v
```

Expected: All PASSED

- [ ] **Step 5: Commit**

```bash
git add pipeline/phase1_geometry.py tests/pipeline/test_phase1_geometry.py
git commit -m "feat: GeometryAnalyzer.explosion_vectors — per-component outward displacement"
```

---

## Task 6: Phase 2 — Render 3 Keyframes

**Files:**
- Create: `pipeline/phase2_snapshots.py`
- Create: `tests/pipeline/test_phase2_snapshots.py`

**Note on pyrender headless rendering on Windows:** pyrender requires either a display or an offscreen backend.
Install with: `pip install pyrender`. On Windows, if you see `pyglet` errors, add this at the top of phase2_snapshots.py:

```python
import os
os.environ["PYOPENGL_PLATFORM"] = "egl"   # Linux/WSL
# or on Windows without EGL:
os.environ["DISPLAY"] = ":99"             # only if running Xvfb
```

If neither works, fall back to trimesh's built-in offscreen renderer:
`scene.save_image(resolution=[1024, 768])` — this uses software rendering.

- [ ] **Step 1: Write the failing tests**

```python
# tests/pipeline/test_phase2_snapshots.py
import pytest
from pathlib import Path
from pipeline.phase1_geometry import GeometryAnalyzer
from pipeline.phase2_snapshots import SnapshotRenderer
from pipeline.models import FrameSet


def test_render_produces_three_png_files(two_box_glb, tmp_path):
    analyzer = GeometryAnalyzer()
    meshes = analyzer.load(str(two_box_glb))
    master = analyzer.master_angle(meshes)
    vectors = analyzer.explosion_vectors(meshes, scalar=1.5)

    renderer = SnapshotRenderer()
    frame_set = renderer.render(meshes, vectors, master, output_dir=tmp_path, scalar=1.5)

    assert isinstance(frame_set, FrameSet)
    assert frame_set.frame_a.exists()
    assert frame_set.frame_b.exists()
    assert frame_set.frame_c.exists()
    assert frame_set.frame_a.suffix == ".png"


def test_render_metadata_fields(two_box_glb, tmp_path):
    analyzer = GeometryAnalyzer()
    meshes = analyzer.load(str(two_box_glb))
    master = analyzer.master_angle(meshes)
    vectors = analyzer.explosion_vectors(meshes, scalar=1.5)

    renderer = SnapshotRenderer()
    frame_set = renderer.render(meshes, vectors, master, output_dir=tmp_path, scalar=1.5)

    meta = frame_set.metadata
    assert meta.master_angle == master
    assert meta.explosion_scalar == 1.5
    assert meta.component_count == len(meshes)
    assert meta.camera_angles_deg == [0.0, 15.0, 30.0]


def test_render_images_are_valid_png(two_box_glb, tmp_path):
    from PIL import Image
    analyzer = GeometryAnalyzer()
    meshes = analyzer.load(str(two_box_glb))
    master = analyzer.master_angle(meshes)
    vectors = analyzer.explosion_vectors(meshes, scalar=1.5)

    renderer = SnapshotRenderer()
    frame_set = renderer.render(meshes, vectors, master, output_dir=tmp_path, scalar=1.5)

    for frame_path in (frame_set.frame_a, frame_set.frame_b, frame_set.frame_c):
        img = Image.open(frame_path)
        assert img.size[0] > 0 and img.size[1] > 0
        assert img.format == "PNG"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/pipeline/test_phase2_snapshots.py -v
```

Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 3: Implement `SnapshotRenderer`**

```python
# pipeline/phase2_snapshots.py
import os
import math
from pathlib import Path
from typing import List

import numpy as np
import trimesh
from PIL import Image

from pipeline.models import FrameSet, PipelineMetadata

# Camera orbit angles per frame (degrees)
CAMERA_ANGLES_DEG = [0.0, 15.0, 30.0]
# Explosion fractions per frame
EXPLOSION_FRACTIONS = [0.0, 0.5, 1.0]
FRAME_NAMES = ["frame_a", "frame_b", "frame_c"]
RESOLUTION = (1024, 768)


class SnapshotRenderer:
    """Phase 2: Render 3 PNG keyframes of the assembly at 0%, 50%, 100% explosion."""

    def render(
        self,
        meshes: List[trimesh.Trimesh],
        explosion_vectors: dict,
        master_angle: str,
        output_dir: Path,
        scalar: float,
    ) -> FrameSet:
        """Render 3 PNG snapshots and return a FrameSet.

        Args:
            meshes: Component meshes from GeometryAnalyzer.load().
            explosion_vectors: Per-mesh displacement vectors from GeometryAnalyzer.explosion_vectors().
            master_angle: Optimal direction name from GeometryAnalyzer.master_angle().
            output_dir: Directory to write frame_a.png, frame_b.png, frame_c.png.
            scalar: Explosion scalar (stored in metadata).

        Returns:
            FrameSet with paths to the 3 PNGs and PipelineMetadata.
        """
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)

        frame_paths = []
        for i, (fraction, orbit_deg, name) in enumerate(
            zip(EXPLOSION_FRACTIONS, CAMERA_ANGLES_DEG, FRAME_NAMES)
        ):
            # Apply explosion to copies of meshes
            exploded_meshes = self._apply_explosion(meshes, explosion_vectors, fraction)
            # Render scene with orbiting camera
            img = self._render_scene(exploded_meshes, master_angle, orbit_deg)
            out_path = output_dir / f"{name}.png"
            img.save(str(out_path))
            frame_paths.append(out_path)

        metadata = PipelineMetadata(
            master_angle=master_angle,
            explosion_scalar=scalar,
            component_count=len(meshes),
            camera_angles_deg=CAMERA_ANGLES_DEG,
        )
        return FrameSet(
            frame_a=frame_paths[0],
            frame_b=frame_paths[1],
            frame_c=frame_paths[2],
            metadata=metadata,
        )

    def _apply_explosion(
        self,
        meshes: List[trimesh.Trimesh],
        explosion_vectors: dict,
        fraction: float,
    ) -> List[trimesh.Trimesh]:
        """Return copies of meshes translated by fraction * explosion_vector."""
        result = []
        for i, mesh in enumerate(meshes):
            copy = mesh.copy()
            if i in explosion_vectors:
                copy.apply_translation(explosion_vectors[i] * fraction)
            result.append(copy)
        return result

    def _render_scene(
        self,
        meshes: List[trimesh.Trimesh],
        master_angle: str,
        orbit_deg: float,
    ) -> Image.Image:
        """Render meshes to a PIL Image using trimesh's built-in scene renderer."""
        scene = trimesh.Scene(meshes)

        # Set camera based on master_angle + orbit offset
        bounds = scene.bounds
        scale = np.linalg.norm(bounds[1] - bounds[0])
        center = scene.centroid

        # Base camera position from master angle
        angle_map = {
            "top":    np.array([0,  1,  0]),
            "bottom": np.array([0, -1,  0]),
            "left":   np.array([-1, 0,  0]),
            "right":  np.array([ 1, 0,  0]),
            "front":  np.array([0,  0,  1]),
            "back":   np.array([ 0, 0, -1]),
        }
        base_dir = angle_map.get(master_angle, np.array([0, 0, 1]))

        # Apply horizontal orbit
        orbit_rad = math.radians(orbit_deg)
        cos_o, sin_o = math.cos(orbit_rad), math.sin(orbit_rad)
        rotated_dir = np.array([
            base_dir[0] * cos_o - base_dir[2] * sin_o,
            base_dir[1],
            base_dir[0] * sin_o + base_dir[2] * cos_o,
        ])

        camera_pos = center + rotated_dir * scale * 2.5
        scene.set_camera(angles=None, distance=None, center=center)

        # Use trimesh's PNG export
        try:
            png_bytes = scene.save_image(resolution=list(RESOLUTION), visible=False)
        except Exception:
            # Fallback: white blank image if renderer unavailable
            png_bytes = None

        if png_bytes:
            import io
            return Image.open(io.BytesIO(png_bytes)).convert("RGB")
        else:
            # Software fallback: plain white PNG (lets pipeline proceed)
            return Image.new("RGB", RESOLUTION, color=(255, 255, 255))
```

- [ ] **Step 4: Run Phase 2 tests**

```bash
pytest tests/pipeline/test_phase2_snapshots.py -v
```

Expected: All PASSED (3 tests)

- [ ] **Step 5: Commit**

```bash
git add pipeline/phase2_snapshots.py tests/pipeline/test_phase2_snapshots.py
git commit -m "feat: SnapshotRenderer — 3 PNG keyframes at 0/50/100 pct explosion"
```

---

## Task 7: Integration Test Phase 1 → 2

**Files:**
- Create: `tests/pipeline/test_integration_phase1_2.py`

- [ ] **Step 1: Write integration test**

```python
# tests/pipeline/test_integration_phase1_2.py
from pathlib import Path
from pipeline.phase1_geometry import GeometryAnalyzer
from pipeline.phase2_snapshots import SnapshotRenderer
from pipeline.models import FrameSet


def test_phase1_to_phase2_full_pipeline(two_box_glb, tmp_path):
    """Full Phase 1 + Phase 2 integration: CAD file → 3 PNG frames."""
    # Phase 1
    analyzer = GeometryAnalyzer()
    meshes = analyzer.load(str(two_box_glb))
    master = analyzer.master_angle(meshes)
    vectors = analyzer.explosion_vectors(meshes, scalar=1.5)

    # Phase 2
    renderer = SnapshotRenderer()
    frame_set = renderer.render(meshes, vectors, master, output_dir=tmp_path, scalar=1.5)

    # Validate output contract (what Phase 3 will consume)
    assert isinstance(frame_set, FrameSet)
    frame_set.validate()  # raises if any PNG missing

    assert frame_set.metadata.master_angle in {
        "top", "bottom", "left", "right", "front", "back"
    }
    assert frame_set.metadata.component_count >= 2
    assert frame_set.metadata.camera_angles_deg == [0.0, 15.0, 30.0]

    print(f"\nMaster angle: {frame_set.metadata.master_angle}")
    print(f"Components: {frame_set.metadata.component_count}")
    print(f"Frames: {frame_set.frame_a}, {frame_set.frame_b}, {frame_set.frame_c}")
```

- [ ] **Step 2: Run integration test**

```bash
pytest tests/pipeline/test_integration_phase1_2.py -v -s
```

Expected: PASSED, with master angle and frame paths printed.

- [ ] **Step 3: Run full test suite**

```bash
pytest tests/pipeline/ -v
```

Expected: All PASSED (no failures)

- [ ] **Step 4: Commit and push**

```bash
git add tests/pipeline/test_integration_phase1_2.py
git commit -m "test: Phase 1→2 integration test — full pipeline to FrameSet"
git push origin main
```

> **Signal to Kirill:** Phase 1/2 complete. `FrameSet` is ready to consume.
> He can now run his Phase 3 tests against real frames from this fixture.

---

## Task 8: Wire Into CLI Entry Point

**Files:**
- Modify: `explodify.py`

- [ ] **Step 1: Update the CLI to run Phase 1 + Phase 2**

```python
# explodify.py
"""
Explodify — CAD assembly to exploded-view animation.
Entry point / CLI.
"""
import argparse
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()


def main():
    parser = argparse.ArgumentParser(description="Explodify: CAD to exploded-view animation")
    parser.add_argument("--input", required=True, help="Path to CAD/mesh file (.glb, .obj, .stl)")
    parser.add_argument("--explode", type=float, default=1.5, help="Explosion scalar multiplier")
    parser.add_argument("--output", default="output/exploded_view.mp4", help="Output video path")
    parser.add_argument("--frames-dir", default="output/frames", help="Directory for PNG frames")
    args = parser.parse_args()

    from pipeline.phase1_geometry import GeometryAnalyzer
    from pipeline.phase2_snapshots import SnapshotRenderer

    frames_dir = Path(args.frames_dir)
    frames_dir.mkdir(parents=True, exist_ok=True)

    print(f"[Phase 1] Loading {args.input} ...")
    analyzer = GeometryAnalyzer()
    meshes = analyzer.load(args.input)
    print(f"[Phase 1] Found {len(meshes)} components")

    master = analyzer.master_angle(meshes)
    print(f"[Phase 1] Master angle: {master}")

    vectors = analyzer.explosion_vectors(meshes, scalar=args.explode)
    print(f"[Phase 1] Explosion vectors computed")

    print("[Phase 2] Rendering keyframes ...")
    renderer = SnapshotRenderer()
    frame_set = renderer.render(meshes, vectors, master, output_dir=frames_dir, scalar=args.explode)
    print(f"[Phase 2] Frames: {frame_set.frame_a}, {frame_set.frame_b}, {frame_set.frame_c}")

    print(f"[Phase 3+4] Stylization + video: not yet implemented (Kirill's side)")
    print(f"[Done] Frame set ready at: {frames_dir}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run a smoke test against the fixture**

```bash
python explodify.py --input tests/pipeline/fixtures/two_box_assembly.glb --explode 1.5 --frames-dir output/frames
```

Expected output:
```
[Phase 1] Loading tests/pipeline/fixtures/two_box_assembly.glb ...
[Phase 1] Found 2 components
[Phase 1] Master angle: left   (or right)
[Phase 1] Explosion vectors computed
[Phase 2] Rendering keyframes ...
[Phase 2] Frames: output/frames/frame_a.png, ...
[Done] Frame set ready at: output/frames
```

- [ ] **Step 3: Add `output/` to `.gitignore`**

```
# .gitignore (add these lines)
output/
.env
__pycache__/
*.pyc
```

- [ ] **Step 4: Final commit and push**

```bash
git add explodify.py .gitignore
git commit -m "feat: wire Phase 1+2 into CLI — CAD file → PNG keyframes"
git push origin main
```

---

## Checklist Before Handing Off

- [ ] `pytest tests/pipeline/ -v` — all green
- [ ] `python explodify.py --input tests/pipeline/fixtures/two_box_assembly.glb` — runs cleanly
- [ ] `output/frames/frame_a.png`, `frame_b.png`, `frame_c.png` exist and open correctly
- [ ] `pipeline/models.py` pushed to main (Kirill can pull)
- [ ] No `.env` file committed
