# Explodify Interface Contract

> **This file is the single source of truth shared between both workstreams.**
> Phase 1/2 (geometry + snapshots) and Phase 3/4 (stylization + video + webapp) are built in parallel.
> Neither side can integrate without agreeing on this contract first.

---

## Shared Data Models — `pipeline/models.py`

This file must be created first (by whoever starts first) and committed before either workstream builds on it.

```python
# pipeline/models.py
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


@dataclass
class PipelineMetadata:
    """Geometry analysis results produced by Phase 1."""
    master_angle: str               # "top" | "bottom" | "left" | "right" | "front" | "back"
    explosion_scalar: float         # E multiplier applied to explosion vectors
    component_count: int            # number of unique mesh IDs detected
    camera_angles_deg: list[float]  # [0.0, 15.0, 30.0] — camera orbit at each frame
    style_prompt: str = ""          # user-supplied aesthetic prompt; passed through to Phase 3 + 4


@dataclass
class FrameSet:
    """Three PNG keyframes produced by Phase 2 and consumed by Phase 3."""
    frame_a: Path   # 0%   explosion, 0°  camera — assembled
    frame_b: Path   # 50%  explosion, 15° camera — mid-explode
    frame_c: Path   # 100% explosion, 30° camera — fully exploded
    metadata: PipelineMetadata

    def validate(self) -> None:
        """Raise ValueError if any frame file is missing."""
        for attr in ("frame_a", "frame_b", "frame_c"):
            p = getattr(self, attr)
            if not Path(p).exists():
                raise ValueError(f"Frame not found: {p}")


@dataclass
class JobResult:
    """Final result returned by the full pipeline."""
    frame_set: FrameSet                 # raw frames from Phase 2
    stylized_frame_set: FrameSet        # AI-rendered frames from Phase 3
    video_path: Path                    # MP4 output from Phase 4
    error: Optional[str] = None
```

---

## Directory Layout (both sides must respect this)

```
explodify/
├── pipeline/
│   ├── __init__.py
│   ├── models.py              ← SHARED CONTRACT (this file)
│   ├── phase1_geometry.py     ← Collaborator
│   ├── phase2_snapshots.py    ← Collaborator
│   ├── phase3_stylize.py      ← Kirill
│   └── phase4_video.py        ← Kirill
├── backend/                   ← Kirill
├── frontend/                  ← Kirill
├── tests/
│   ├── pipeline/
│   │   ├── fixtures/          ← Collaborator creates, Kirill may add to
│   │   ├── test_phase1_geometry.py
│   │   ├── test_phase2_snapshots.py
│   │   ├── test_phase3_stylize.py
│   │   └── test_phase4_video.py
│   └── backend/
│       └── test_api.py
├── .env.example
├── requirements.txt
└── explodify.py
```

---

## Git Workflow

Both work on the `main` branch (hackathon pace — no feature branches).
- Commit early, commit often.
- When creating `pipeline/models.py`, commit immediately so the other side can pull.
- Pull before starting each new task.

---

## Environment Variables (`.env` at project root)

```env
GOOGLE_API_KEY=           # Gemini Flash — Phase 3
FAL_KEY=                  # fal.ai — Phase 4
```

Both sides need a `.env.example` committed. Neither side commits a real `.env`.

---

## Integration Test Command

Once both sides are done, run:

```bash
python explodify.py --input tests/pipeline/fixtures/two_box_assembly.glb --explode 1.5 --output output/test_run.mp4
```

Expected: `output/test_run.mp4` exists and is a valid video file.
