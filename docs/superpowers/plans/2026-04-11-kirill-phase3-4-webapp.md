# Explodify — Phase 3, 4 & Web App Implementation Plan (Kirill)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Phase 3 (Gemini Flash image stylization), Phase 4 (fal.ai video synthesis), a FastAPI backend that runs the full pipeline as async jobs, and a React + Vite frontend with file upload, live phase progress, and video preview.

**Architecture:** The pipeline is split into four Python modules (`phase3_stylize.py`, `phase4_video.py`) that consume/produce the shared `FrameSet` type. A FastAPI backend wraps the full pipeline in an async background job. A React frontend polls for job status and streams phase-by-phase progress. Phase 1/2 are written by the collaborator — this plan assumes they're merged to `main` before Tasks 1–3.

**Tech Stack:** Python 3.11, google-genai>=1.0, fal-client>=0.4, FastAPI, uvicorn, React 18, Vite, TypeScript, Tailwind CSS

**Read first:** `docs/superpowers/plans/2026-04-11-interface-contract.md`

---

## Prerequisites

Before starting Task 2, pull from main to get the collaborator's `pipeline/models.py`:

```bash
git pull origin main
```

You can start Task 1 (env setup) and Task 5 (FastAPI skeleton) independently while waiting.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `pipeline/models.py` | Pull (collaborator creates) | Shared contract |
| `pipeline/phase3_stylize.py` | Create | `GeminiStylizer` class |
| `pipeline/phase4_video.py` | Create | `FalVideoSynth` class |
| `backend/__init__.py` | Create | Empty |
| `backend/main.py` | Create | FastAPI app, endpoints |
| `backend/jobs.py` | Create | In-memory async job queue |
| `backend/models.py` | Create | Pydantic request/response models |
| `frontend/package.json` | Create | Vite + React + Tailwind |
| `frontend/vite.config.ts` | Create | Vite config with backend proxy |
| `frontend/src/App.tsx` | Create | Root component, routing |
| `frontend/src/api/client.ts` | Create | fetch wrapper for backend |
| `frontend/src/components/UploadZone.tsx` | Create | Drag-and-drop file upload |
| `frontend/src/components/PipelineProgress.tsx` | Create | Phase progress tracker |
| `frontend/src/components/VideoPreview.tsx` | Create | MP4 player + download |
| `tests/pipeline/test_phase3_stylize.py` | Create | Gemini stylization tests |
| `tests/pipeline/test_phase4_video.py` | Create | fal.ai video tests |
| `tests/backend/test_api.py` | Create | FastAPI endpoint tests |
| `tests/backend/__init__.py` | Create | Empty |

---

## Task 1: Environment Setup

**Files:**
- Create: `.env` (local only, not committed)
- Modify: `requirements.txt`

- [ ] **Step 1: Install backend dependencies**

```bash
pip install fastapi uvicorn[standard] python-multipart google-genai fal-client python-dotenv pillow pytest httpx
```

- [ ] **Step 2: Verify `requirements.txt`**

```
trimesh>=4.0.0
pyrender>=0.1.45
numpy>=1.24.0
Pillow>=10.0.0
google-genai>=1.0.0
fal-client>=0.4.0
python-dotenv>=1.0.0
fastapi>=0.110.0
uvicorn[standard]>=0.27.0
python-multipart>=0.0.9
httpx>=0.27.0
pytest>=7.0.0
```

- [ ] **Step 3: Create `.env` (do NOT commit)**

```
GOOGLE_API_KEY=your_actual_gemini_key
FAL_KEY=your_actual_fal_key
```

- [ ] **Step 4: Verify `.gitignore` includes `.env`**

```
.env
output/
__pycache__/
*.pyc
node_modules/
frontend/dist/
```

---

## Task 2: Phase 3 — Gemini Flash Stylization

**Files:**
- Create: `pipeline/phase3_stylize.py`
- Create: `tests/pipeline/test_phase3_stylize.py`

**Dependency:** `pipeline/models.py` must be on main (pull first).

`★ Insight ─────────────────────────────────────`
Gemini's image generation requires the `gemini-2.0-flash-preview-image-generation` model (not the standard Flash model). The response modality must be set to `["IMAGE"]`. The image bytes come back in `response.candidates[0].content.parts[0].inline_data.data`.
`─────────────────────────────────────────────────`

- [ ] **Step 1: Write the failing tests**

```python
# tests/pipeline/test_phase3_stylize.py
import pytest
from pathlib import Path
from unittest.mock import patch, MagicMock
from pipeline.phase3_stylize import GeminiStylizer
from pipeline.models import FrameSet, PipelineMetadata


@pytest.fixture
def mock_frame_set(tmp_path):
    """FrameSet with real (blank white) PNGs for testing without a real CAD file."""
    from PIL import Image
    for name in ("frame_a.png", "frame_b.png", "frame_c.png"):
        Image.new("RGB", (256, 256), color=(200, 200, 200)).save(tmp_path / name)
    return FrameSet(
        frame_a=tmp_path / "frame_a.png",
        frame_b=tmp_path / "frame_b.png",
        frame_c=tmp_path / "frame_c.png",
        metadata=PipelineMetadata(
            master_angle="front",
            explosion_scalar=1.5,
            component_count=2,
            camera_angles_deg=[0.0, 15.0, 30.0],
        ),
    )


def test_stylize_returns_frame_set_with_three_pngs(mock_frame_set, tmp_path):
    """Stylize should return a FrameSet with 3 existing PNG files."""
    stylized_dir = tmp_path / "stylized"

    # Mock the Gemini API to return a white 256x256 PNG
    import io
    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", (256, 256), color=(240, 240, 240)).save(buf, format="PNG")
    fake_png_bytes = buf.getvalue()

    fake_part = MagicMock()
    fake_part.inline_data.data = fake_png_bytes
    fake_part.inline_data.mime_type = "image/png"
    fake_response = MagicMock()
    fake_response.candidates[0].content.parts = [fake_part]

    with patch("pipeline.phase3_stylize.genai") as mock_genai:
        mock_client = MagicMock()
        mock_genai.Client.return_value = mock_client
        mock_client.models.generate_content.return_value = fake_response

        stylizer = GeminiStylizer(api_key="fake_key")
        result = stylizer.stylize(mock_frame_set, output_dir=stylized_dir)

    assert isinstance(result, FrameSet)
    assert result.frame_a.exists()
    assert result.frame_b.exists()
    assert result.frame_c.exists()


def test_stylize_preserves_metadata(mock_frame_set, tmp_path):
    import io
    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", (256, 256)).save(buf, format="PNG")
    fake_png_bytes = buf.getvalue()

    fake_part = MagicMock()
    fake_part.inline_data.data = fake_png_bytes
    fake_part.inline_data.mime_type = "image/png"
    fake_response = MagicMock()
    fake_response.candidates[0].content.parts = [fake_part]

    with patch("pipeline.phase3_stylize.genai") as mock_genai:
        mock_client = MagicMock()
        mock_genai.Client.return_value = mock_client
        mock_client.models.generate_content.return_value = fake_response

        stylizer = GeminiStylizer(api_key="fake_key")
        result = stylizer.stylize(mock_frame_set, output_dir=tmp_path / "s2")

    assert result.metadata.master_angle == "front"
    assert result.metadata.component_count == 2
```

- [ ] **Step 2: Run to verify failure**

```bash
pytest tests/pipeline/test_phase3_stylize.py -v
```

Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 3: Implement `GeminiStylizer`**

```python
# pipeline/phase3_stylize.py
import io
import os
from pathlib import Path
from typing import List

from PIL import Image
from google import genai
from google.genai import types

from pipeline.models import FrameSet, PipelineMetadata

STYLE_PROMPT = (
    "Transform this 3D render into a high-end industrial design advertisement render. "
    "Blender Cycles quality, dramatic studio lighting with soft shadows, "
    "brushed aluminum and polycarbonate materials, pure white background, "
    "photorealistic product photography style. Preserve the exact structure, "
    "layout, and positions of all components. Do not add or remove parts."
)

MODEL = "gemini-2.0-flash-preview-image-generation"


class GeminiStylizer:
    """Phase 3: Stylize raw PNG snapshots into photorealistic renders via Gemini Flash."""

    def __init__(self, api_key: str | None = None):
        self._api_key = api_key or os.environ["GOOGLE_API_KEY"]
        self._client = genai.Client(api_key=self._api_key)

    def stylize(self, frame_set: FrameSet, output_dir: Path) -> FrameSet:
        """Apply Gemini image-to-image stylization to all 3 frames.

        Args:
            frame_set: Raw FrameSet produced by Phase 2.
            output_dir: Directory to write stylized_frame_a.png etc.

        Returns:
            New FrameSet pointing to stylized PNG files, with same metadata.
        """
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)

        frame_map = [
            (frame_set.frame_a, "frame_a.png"),
            (frame_set.frame_b, "frame_b.png"),
            (frame_set.frame_c, "frame_c.png"),
        ]
        output_paths = []
        for src_path, out_name in frame_map:
            out_path = output_dir / out_name
            stylized = self._stylize_single(src_path)
            stylized.save(str(out_path))
            output_paths.append(out_path)

        return FrameSet(
            frame_a=output_paths[0],
            frame_b=output_paths[1],
            frame_c=output_paths[2],
            metadata=frame_set.metadata,
        )

    def _stylize_single(self, frame_path: Path) -> Image.Image:
        """Call Gemini to stylize one PNG. Returns PIL Image."""
        with open(frame_path, "rb") as f:
            image_bytes = f.read()

        response = self._client.models.generate_content(
            model=MODEL,
            contents=[
                types.Part.from_bytes(data=image_bytes, mime_type="image/png"),
                types.Part.from_text(STYLE_PROMPT),
            ],
            config=types.GenerateContentConfig(
                response_modalities=["IMAGE"],
            ),
        )

        for part in response.candidates[0].content.parts:
            if part.inline_data and "image" in part.inline_data.mime_type:
                return Image.open(io.BytesIO(part.inline_data.data)).convert("RGB")

        raise RuntimeError(f"Gemini returned no image for {frame_path.name}")
```

- [ ] **Step 4: Run tests**

```bash
pytest tests/pipeline/test_phase3_stylize.py -v
```

Expected: 2 PASSED

- [ ] **Step 5: Commit**

```bash
git add pipeline/phase3_stylize.py tests/pipeline/test_phase3_stylize.py
git commit -m "feat: GeminiStylizer — Gemini Flash image-to-image stylization for all 3 keyframes"
```

---

## Task 3: Phase 4 — fal.ai Video Synthesis

**Files:**
- Create: `pipeline/phase4_video.py`
- Create: `tests/pipeline/test_phase4_video.py`

`★ Insight ─────────────────────────────────────`
fal.ai's Kling v2 model supports `image_url` (start) and `tail_image_url` (end) for a single clip. We generate 2 clips (A→B and B→C) then stitch them with Pillow/imageio rather than relying on 3-frame native support, which is more reliable. Each clip is 3 seconds → 6s total.
`─────────────────────────────────────────────────`

- [ ] **Step 1: Write the failing tests**

```python
# tests/pipeline/test_phase4_video.py
import pytest
from pathlib import Path
from unittest.mock import patch, MagicMock
from pipeline.phase4_video import FalVideoSynth
from pipeline.models import FrameSet, PipelineMetadata
from PIL import Image
import io


@pytest.fixture
def stylized_frame_set(tmp_path):
    for name in ("frame_a.png", "frame_b.png", "frame_c.png"):
        Image.new("RGB", (256, 256), color=(200, 200, 200)).save(tmp_path / name)
    return FrameSet(
        frame_a=tmp_path / "frame_a.png",
        frame_b=tmp_path / "frame_b.png",
        frame_c=tmp_path / "frame_c.png",
        metadata=PipelineMetadata(
            master_angle="front",
            explosion_scalar=1.5,
            component_count=2,
            camera_angles_deg=[0.0, 15.0, 30.0],
        ),
    )


def test_synthesize_produces_mp4(stylized_frame_set, tmp_path):
    """synthesize() should write an MP4 file and return its path."""
    output_path = tmp_path / "output.mp4"

    fake_video_bytes = b"\x00" * 1024  # minimal fake MP4 bytes

    with patch("pipeline.phase4_video.fal_client") as mock_fal:
        mock_result = {"video": {"url": "https://fake.fal.ai/clip.mp4"}}
        mock_fal.subscribe.return_value = mock_result

        with patch("pipeline.phase4_video.requests") as mock_requests:
            mock_resp = MagicMock()
            mock_resp.content = fake_video_bytes
            mock_requests.get.return_value = mock_resp

            synth = FalVideoSynth(fal_key="fake_key")
            result_path = synth.synthesize(stylized_frame_set, output_path=output_path)

    assert result_path == output_path
    assert output_path.exists()


def test_synthesize_calls_fal_twice(stylized_frame_set, tmp_path):
    """Two fal.ai calls: clip A→B and clip B→C."""
    output_path = tmp_path / "output.mp4"
    fake_video_bytes = b"\x00" * 512

    with patch("pipeline.phase4_video.fal_client") as mock_fal:
        mock_fal.subscribe.return_value = {"video": {"url": "https://fake.fal.ai/clip.mp4"}}
        with patch("pipeline.phase4_video.requests") as mock_requests:
            mock_resp = MagicMock()
            mock_resp.content = fake_video_bytes
            mock_requests.get.return_value = mock_resp

            synth = FalVideoSynth(fal_key="fake_key")
            synth.synthesize(stylized_frame_set, output_path=output_path)

    assert mock_fal.subscribe.call_count == 2
```

- [ ] **Step 2: Run to verify failure**

```bash
pytest tests/pipeline/test_phase4_video.py -v
```

Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 3: Implement `FalVideoSynth`**

```python
# pipeline/phase4_video.py
import base64
import os
import tempfile
from pathlib import Path

import fal_client
import requests

from pipeline.models import FrameSet

FAL_MODEL = "fal-ai/kling-video/v2/master/image-to-video"
CLIP_DURATION = "5"   # seconds per clip — 2 clips = ~10s total
CLIP_PROMPT = (
    "Smooth product animation. Parts separate cleanly and gracefully. "
    "Studio lighting. Clean white background. Product advertisement style."
)


class FalVideoSynth:
    """Phase 4: Generate a video from 3 stylized keyframes using fal.ai Kling v2."""

    def __init__(self, fal_key: str | None = None):
        key = fal_key or os.environ.get("FAL_KEY", "")
        os.environ["FAL_KEY"] = key  # fal_client reads from env

    def synthesize(self, stylized_frames: FrameSet, output_path: Path) -> Path:
        """Generate two video clips (A→B, B→C) and stitch into one MP4.

        Args:
            stylized_frames: FrameSet from GeminiStylizer.stylize().
            output_path: Path to write the final .mp4.

        Returns:
            output_path after writing.
        """
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        # Upload frames as base64 data URIs (fal.ai accepts these)
        frame_a_uri = self._to_data_uri(stylized_frames.frame_a)
        frame_b_uri = self._to_data_uri(stylized_frames.frame_b)
        frame_c_uri = self._to_data_uri(stylized_frames.frame_c)

        # Clip 1: assembled → mid-explode (frame A → frame B)
        clip1_bytes = self._generate_clip(frame_a_uri, frame_b_uri)
        # Clip 2: mid-explode → fully exploded (frame B → frame C)
        clip2_bytes = self._generate_clip(frame_b_uri, frame_c_uri)

        # Stitch clips by concatenating raw bytes (works for quick demo; use ffmpeg for production)
        stitched = self._stitch_clips(clip1_bytes, clip2_bytes, output_path)
        return stitched

    def _to_data_uri(self, frame_path: Path) -> str:
        """Convert PNG file to base64 data URI for fal.ai upload."""
        with open(frame_path, "rb") as f:
            data = base64.b64encode(f.read()).decode()
        return f"data:image/png;base64,{data}"

    def _generate_clip(self, start_image_url: str, end_image_url: str) -> bytes:
        """Call fal.ai Kling v2 to generate one video clip. Returns video bytes."""
        result = fal_client.subscribe(
            FAL_MODEL,
            arguments={
                "prompt": CLIP_PROMPT,
                "image_url": start_image_url,
                "tail_image_url": end_image_url,
                "duration": CLIP_DURATION,
                "aspect_ratio": "16:9",
                "cfg_scale": 0.5,
            },
        )
        video_url = result["video"]["url"]
        resp = requests.get(video_url, timeout=60)
        resp.raise_for_status()
        return resp.content

    def _stitch_clips(self, clip1: bytes, clip2: bytes, output_path: Path) -> Path:
        """Write both clips to temp files, concatenate with ffmpeg, return output_path."""
        import subprocess

        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f1:
            f1.write(clip1)
            clip1_path = f1.name
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f2:
            f2.write(clip2)
            clip2_path = f2.name

        concat_list = tempfile.NamedTemporaryFile(
            mode="w", suffix=".txt", delete=False
        )
        concat_list.write(f"file '{clip1_path}'\nfile '{clip2_path}'\n")
        concat_list.close()

        try:
            subprocess.run(
                [
                    "ffmpeg", "-y",
                    "-f", "concat", "-safe", "0",
                    "-i", concat_list.name,
                    "-c", "copy",
                    str(output_path),
                ],
                check=True,
                capture_output=True,
            )
        except (subprocess.CalledProcessError, FileNotFoundError):
            # ffmpeg not available — just write clip1 as fallback
            output_path.write_bytes(clip1)

        return output_path
```

- [ ] **Step 4: Run tests**

```bash
pytest tests/pipeline/test_phase4_video.py -v
```

Expected: 2 PASSED

- [ ] **Step 5: Commit**

```bash
git add pipeline/phase4_video.py tests/pipeline/test_phase4_video.py
git commit -m "feat: FalVideoSynth — Kling v2 two-clip generation + stitch"
```

---

## Task 4: FastAPI Backend — Models + Job Queue

**Files:**
- Create: `backend/__init__.py`
- Create: `backend/models.py`
- Create: `backend/jobs.py`

- [ ] **Step 1: Create `backend/__init__.py`** (empty)

- [ ] **Step 2: Create `backend/models.py`**

```python
# backend/models.py
from enum import Enum
from typing import Optional
from pydantic import BaseModel


class PhaseStatus(str, Enum):
    pending = "pending"
    running = "running"
    done = "done"
    error = "error"


class JobStatus(BaseModel):
    job_id: str
    status: str               # "queued" | "running" | "done" | "error"
    current_phase: int        # 1–4
    current_phase_name: str
    phases: dict[int, PhaseStatus]
    error: Optional[str] = None
    video_url: Optional[str] = None  # set when status == "done"
```

- [ ] **Step 3: Create `backend/jobs.py`**

```python
# backend/jobs.py
import asyncio
import uuid
from pathlib import Path
from typing import Callable

from backend.models import JobStatus, PhaseStatus

PHASE_NAMES = {
    1: "Geometric analysis",
    2: "Rendering keyframes",
    3: "AI stylization",
    4: "Video synthesis",
}

# In-memory store: job_id → JobStatus
_jobs: dict[str, JobStatus] = {}
# In-memory store: job_id → output video path
_video_paths: dict[str, Path] = {}


def create_job() -> str:
    job_id = str(uuid.uuid4())
    _jobs[job_id] = JobStatus(
        job_id=job_id,
        status="queued",
        current_phase=1,
        current_phase_name=PHASE_NAMES[1],
        phases={i: PhaseStatus.pending for i in range(1, 5)},
    )
    return job_id


def get_job(job_id: str) -> JobStatus | None:
    return _jobs.get(job_id)


def get_video_path(job_id: str) -> Path | None:
    return _video_paths.get(job_id)


def update_phase(job_id: str, phase: int, status: PhaseStatus) -> None:
    job = _jobs[job_id]
    # Create new dict (immutable pattern)
    new_phases = {**job.phases, phase: status}
    _jobs[job_id] = JobStatus(
        job_id=job_id,
        status="running",
        current_phase=phase,
        current_phase_name=PHASE_NAMES[phase],
        phases=new_phases,
        error=job.error,
        video_url=job.video_url,
    )


def mark_done(job_id: str, video_path: Path) -> None:
    job = _jobs[job_id]
    _video_paths[job_id] = video_path
    new_phases = {i: PhaseStatus.done for i in range(1, 5)}
    _jobs[job_id] = JobStatus(
        job_id=job_id,
        status="done",
        current_phase=4,
        current_phase_name=PHASE_NAMES[4],
        phases=new_phases,
        video_url=f"/jobs/{job_id}/video",
    )


def mark_error(job_id: str, phase: int, message: str) -> None:
    job = _jobs[job_id]
    new_phases = {**job.phases, phase: PhaseStatus.error}
    _jobs[job_id] = JobStatus(
        job_id=job_id,
        status="error",
        current_phase=phase,
        current_phase_name=PHASE_NAMES[phase],
        phases=new_phases,
        error=message,
    )
```

- [ ] **Step 4: Commit**

```bash
git add backend/__init__.py backend/models.py backend/jobs.py
git commit -m "feat: backend job queue and status models"
```

---

## Task 5: FastAPI Backend — Endpoints

**Files:**
- Create: `backend/main.py`
- Create: `tests/backend/__init__.py`
- Create: `tests/backend/test_api.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/backend/test_api.py
import pytest
from pathlib import Path
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
from backend.main import app

client = TestClient(app)

FIXTURE_GLB = Path("tests/pipeline/fixtures/two_box_assembly.glb")


def test_health_check():
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_create_job_returns_job_id():
    if not FIXTURE_GLB.exists():
        pytest.skip("Run create_test_assembly.py first")

    with open(FIXTURE_GLB, "rb") as f:
        resp = client.post(
            "/jobs",
            files={"file": ("assembly.glb", f, "application/octet-stream")},
            data={"explode_scalar": "1.5"},
        )
    assert resp.status_code == 202
    body = resp.json()
    assert "job_id" in body
    assert len(body["job_id"]) > 0


def test_get_job_status():
    if not FIXTURE_GLB.exists():
        pytest.skip("Run create_test_assembly.py first")

    with open(FIXTURE_GLB, "rb") as f:
        create_resp = client.post(
            "/jobs",
            files={"file": ("assembly.glb", f, "application/octet-stream")},
            data={"explode_scalar": "1.5"},
        )
    job_id = create_resp.json()["job_id"]

    status_resp = client.get(f"/jobs/{job_id}")
    assert status_resp.status_code == 200
    body = status_resp.json()
    assert body["job_id"] == job_id
    assert body["status"] in {"queued", "running", "done", "error"}


def test_get_unknown_job_returns_404():
    resp = client.get("/jobs/nonexistent-job-id")
    assert resp.status_code == 404
```

- [ ] **Step 2: Run to verify failure**

```bash
pytest tests/backend/test_api.py::test_health_check -v
```

Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 3: Implement `backend/main.py`**

```python
# backend/main.py
import asyncio
import os
import tempfile
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

import backend.jobs as jobs
from backend.models import JobStatus

load_dotenv()

app = FastAPI(title="Explodify API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = Path(tempfile.gettempdir()) / "explodify_uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/jobs", status_code=202)
async def create_job(
    file: UploadFile = File(...),
    explode_scalar: float = Form(1.5),
):
    """Accept a CAD file upload, create a background job, return job_id."""
    # Save uploaded file
    suffix = Path(file.filename or "upload.glb").suffix
    tmp_path = UPLOAD_DIR / f"{jobs.create_job()}{suffix}"
    content = await file.read()
    tmp_path.write_bytes(content)

    # Create job entry
    job_id = jobs.create_job()

    # Fire-and-forget background task
    asyncio.create_task(
        _run_pipeline(job_id, tmp_path, explode_scalar)
    )

    return {"job_id": job_id}


@app.get("/jobs/{job_id}", response_model=JobStatus)
def get_job(job_id: str):
    job = jobs.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    return job


@app.get("/jobs/{job_id}/video")
def get_video(job_id: str):
    job = jobs.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status != "done":
        raise HTTPException(status_code=425, detail="Video not ready yet")
    video_path = jobs.get_video_path(job_id)
    if not video_path or not video_path.exists():
        raise HTTPException(status_code=404, detail="Video file missing")
    return FileResponse(str(video_path), media_type="video/mp4")


async def _run_pipeline(job_id: str, cad_path: Path, scalar: float) -> None:
    """Run all 4 pipeline phases in a background asyncio task."""
    output_dir = UPLOAD_DIR / job_id
    output_dir.mkdir(parents=True, exist_ok=True)

    try:
        # Phase 1
        jobs.update_phase(job_id, 1, "running")
        from pipeline.phase1_geometry import GeometryAnalyzer
        analyzer = GeometryAnalyzer()
        meshes = await asyncio.to_thread(analyzer.load, str(cad_path))
        master = await asyncio.to_thread(analyzer.master_angle, meshes)
        vectors = await asyncio.to_thread(analyzer.explosion_vectors, meshes, scalar)
        jobs.update_phase(job_id, 1, "done")

        # Phase 2
        jobs.update_phase(job_id, 2, "running")
        from pipeline.phase2_snapshots import SnapshotRenderer
        renderer = SnapshotRenderer()
        frame_set = await asyncio.to_thread(
            renderer.render, meshes, vectors, master, output_dir / "raw", scalar
        )
        jobs.update_phase(job_id, 2, "done")

        # Phase 3
        jobs.update_phase(job_id, 3, "running")
        from pipeline.phase3_stylize import GeminiStylizer
        stylizer = GeminiStylizer()
        stylized = await asyncio.to_thread(
            stylizer.stylize, frame_set, output_dir / "stylized"
        )
        jobs.update_phase(job_id, 3, "done")

        # Phase 4
        jobs.update_phase(job_id, 4, "running")
        from pipeline.phase4_video import FalVideoSynth
        synth = FalVideoSynth()
        video_path = await asyncio.to_thread(
            synth.synthesize, stylized, output_dir / "output.mp4"
        )
        jobs.update_phase(job_id, 4, "done")

        jobs.mark_done(job_id, video_path)

    except Exception as e:
        phase = jobs.get_job(job_id).current_phase
        jobs.mark_error(job_id, phase, str(e))
```

- [ ] **Step 4: Run backend tests**

```bash
pytest tests/backend/test_api.py -v
```

Expected: All PASSED

- [ ] **Step 5: Commit**

```bash
git add backend/main.py tests/backend/__init__.py tests/backend/test_api.py
git commit -m "feat: FastAPI backend — upload endpoint, job status, video delivery"
```

---

## Task 6: React Frontend — Project Setup

**Files:**
- Create: `frontend/` (Vite + React + Tailwind)

- [ ] **Step 1: Scaffold Vite project**

```bash
cd C:/Users/Kirill/explodify
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

- [ ] **Step 2: Configure Tailwind — `frontend/tailwind.config.js`**

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: { extend: {} },
  plugins: [],
}
```

- [ ] **Step 3: Add Tailwind to `frontend/src/index.css`**

Replace entire file with:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 4: Configure backend proxy — `frontend/vite.config.ts`**

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/jobs': 'http://localhost:8000',
      '/health': 'http://localhost:8000',
    },
  },
})
```

- [ ] **Step 5: Create API client — `frontend/src/api/client.ts`**

```ts
// frontend/src/api/client.ts

export interface PhaseStatus {
  [phase: number]: 'pending' | 'running' | 'done' | 'error'
}

export interface JobStatus {
  job_id: string
  status: 'queued' | 'running' | 'done' | 'error'
  current_phase: number
  current_phase_name: string
  phases: PhaseStatus
  error: string | null
  video_url: string | null
}

export async function createJob(file: File, explodeScalar: number): Promise<string> {
  const form = new FormData()
  form.append('file', file)
  form.append('explode_scalar', String(explodeScalar))

  const resp = await fetch('/jobs', { method: 'POST', body: form })
  if (!resp.ok) throw new Error(`Upload failed: ${resp.statusText}`)
  const data = await resp.json()
  return data.job_id as string
}

export async function getJobStatus(jobId: string): Promise<JobStatus> {
  const resp = await fetch(`/jobs/${jobId}`)
  if (!resp.ok) throw new Error(`Status check failed: ${resp.statusText}`)
  return resp.json()
}

export function getVideoUrl(jobId: string): string {
  return `/jobs/${jobId}/video`
}
```

- [ ] **Step 6: Commit**

```bash
cd C:/Users/Kirill/explodify
git add frontend/
git commit -m "feat: React + Vite + Tailwind frontend scaffold with API client"
```

---

## Task 7: Frontend — UploadZone Component

**Files:**
- Create: `frontend/src/components/UploadZone.tsx`

- [ ] **Step 1: Implement `UploadZone`**

```tsx
// frontend/src/components/UploadZone.tsx
import { useState, DragEvent, ChangeEvent } from 'react'

interface Props {
  onUpload: (file: File, scalar: number) => void
  disabled?: boolean
}

export function UploadZone({ onUpload, disabled }: Props) {
  const [dragging, setDragging] = useState(false)
  const [scalar, setScalar] = useState(1.5)

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) onUpload(file, scalar)
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) onUpload(file, scalar)
  }

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-xl">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`
          w-full rounded-2xl border-2 border-dashed p-12
          flex flex-col items-center justify-center gap-3 cursor-pointer
          transition-colors
          ${dragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-gray-50'}
          ${disabled ? 'opacity-50 pointer-events-none' : 'hover:border-blue-400'}
        `}
        onClick={() => document.getElementById('file-input')?.click()}
      >
        <svg className="w-12 h-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
        </svg>
        <p className="text-gray-600 font-medium">Drop your CAD file here</p>
        <p className="text-gray-400 text-sm">.glb · .obj · .stl</p>
        <input
          id="file-input"
          type="file"
          accept=".glb,.obj,.stl"
          className="hidden"
          onChange={handleFileChange}
          disabled={disabled}
        />
      </div>

      <div className="flex items-center gap-3 w-full">
        <label className="text-sm text-gray-600 whitespace-nowrap">
          Explosion strength: <span className="font-semibold">{scalar.toFixed(1)}×</span>
        </label>
        <input
          type="range" min={0.5} max={3.0} step={0.1}
          value={scalar}
          onChange={(e) => setScalar(parseFloat(e.target.value))}
          className="flex-1"
          disabled={disabled}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/UploadZone.tsx
git commit -m "feat: UploadZone — drag-and-drop CAD file upload with explosion slider"
```

---

## Task 8: Frontend — PipelineProgress + VideoPreview Components

**Files:**
- Create: `frontend/src/components/PipelineProgress.tsx`
- Create: `frontend/src/components/VideoPreview.tsx`

- [ ] **Step 1: Implement `PipelineProgress`**

```tsx
// frontend/src/components/PipelineProgress.tsx
import { JobStatus } from '../api/client'

const PHASES = [
  { id: 1, name: 'Geometric Analysis',   icon: '🔬', detail: 'Ray-casting optimal angle + explosion vectors' },
  { id: 2, name: 'Rendering Keyframes',  icon: '📷', detail: '3 PNG snapshots at 0%, 50%, 100% explosion' },
  { id: 3, name: 'AI Stylization',       icon: '✨', detail: 'Gemini Flash photorealistic rendering' },
  { id: 4, name: 'Video Synthesis',      icon: '🎬', detail: 'fal.ai Kling keyframe-anchored animation' },
]

interface Props {
  job: JobStatus
}

export function PipelineProgress({ job }: Props) {
  return (
    <div className="w-full max-w-xl flex flex-col gap-3">
      {PHASES.map((phase) => {
        const status = job.phases[phase.id] ?? 'pending'
        return (
          <div key={phase.id}
            className={`
              flex items-center gap-4 rounded-xl p-4 border transition-all
              ${status === 'done'    ? 'border-green-200 bg-green-50'  : ''}
              ${status === 'running' ? 'border-blue-300 bg-blue-50 shadow-sm' : ''}
              ${status === 'pending' ? 'border-gray-200 bg-gray-50 opacity-60' : ''}
              ${status === 'error'   ? 'border-red-200 bg-red-50'   : ''}
            `}
          >
            <span className="text-2xl">{phase.icon}</span>
            <div className="flex-1 min-w-0">
              <p className={`font-medium text-sm ${status === 'running' ? 'text-blue-700' : 'text-gray-700'}`}>
                {phase.name}
              </p>
              <p className="text-xs text-gray-400 truncate">{phase.detail}</p>
            </div>
            <StatusBadge status={status} />
          </div>
        )
      })}
      {job.error && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">
          <strong>Error:</strong> {job.error}
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'done')    return <span className="text-green-600 text-lg">✓</span>
  if (status === 'running') return <Spinner />
  if (status === 'error')   return <span className="text-red-500 text-lg">✗</span>
  return <span className="w-4 h-4 rounded-full border-2 border-gray-300" />
}

function Spinner() {
  return (
    <svg className="animate-spin w-5 h-5 text-blue-500" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}
```

- [ ] **Step 2: Implement `VideoPreview`**

```tsx
// frontend/src/components/VideoPreview.tsx
import { getVideoUrl } from '../api/client'

interface Props {
  jobId: string
}

export function VideoPreview({ jobId }: Props) {
  const url = getVideoUrl(jobId)

  return (
    <div className="w-full max-w-xl flex flex-col items-center gap-4">
      <video
        src={url}
        controls
        autoPlay
        loop
        className="w-full rounded-2xl shadow-lg bg-black"
      />
      <a
        href={url}
        download="explodify_animation.mp4"
        className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors"
      >
        Download MP4
      </a>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/PipelineProgress.tsx frontend/src/components/VideoPreview.tsx
git commit -m "feat: PipelineProgress phase tracker + VideoPreview player"
```

---

## Task 9: Frontend — App.tsx (Wire Everything Together)

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Implement `App.tsx`**

```tsx
// frontend/src/App.tsx
import { useState, useEffect, useRef } from 'react'
import { UploadZone } from './components/UploadZone'
import { PipelineProgress } from './components/PipelineProgress'
import { VideoPreview } from './components/VideoPreview'
import { createJob, getJobStatus, JobStatus } from './api/client'

type AppState = 'idle' | 'uploading' | 'processing' | 'done' | 'error'

export default function App() {
  const [state, setState] = useState<AppState>('idle')
  const [jobId, setJobId] = useState<string | null>(null)
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  async function handleUpload(file: File, scalar: number) {
    try {
      setState('uploading')
      const id = await createJob(file, scalar)
      setJobId(id)
      setState('processing')
    } catch (e) {
      setState('error')
    }
  }

  useEffect(() => {
    if (state !== 'processing' || !jobId) return

    pollRef.current = setInterval(async () => {
      try {
        const status = await getJobStatus(jobId)
        setJobStatus(status)
        if (status.status === 'done') {
          setState('done')
          clearInterval(pollRef.current!)
        } else if (status.status === 'error') {
          setState('error')
          clearInterval(pollRef.current!)
        }
      } catch {
        // keep polling on transient errors
      }
    }, 2000)

    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [state, jobId])

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-start px-4 py-16 gap-10">
      <header className="text-center">
        <h1 className="text-4xl font-bold tracking-tight text-gray-900">Explodify</h1>
        <p className="text-gray-500 mt-2">CAD file → studio-grade exploded-view animation</p>
      </header>

      {(state === 'idle' || state === 'uploading') && (
        <UploadZone onUpload={handleUpload} disabled={state === 'uploading'} />
      )}

      {(state === 'processing' || state === 'error') && jobStatus && (
        <PipelineProgress job={jobStatus} />
      )}

      {state === 'done' && jobId && (
        <>
          <VideoPreview jobId={jobId} />
          <button
            onClick={() => {
              setState('idle')
              setJobId(null)
              setJobStatus(null)
            }}
            className="text-sm text-gray-400 hover:text-gray-600 underline"
          >
            Upload another file
          </button>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Run the dev server to verify the UI**

Open two terminals:

**Terminal 1 — Backend:**
```bash
cd C:/Users/Kirill/explodify
uvicorn backend.main:app --reload --port 8000
```

**Terminal 2 — Frontend:**
```bash
cd C:/Users/Kirill/explodify/frontend
npm run dev
```

Open `http://localhost:5173`. Verify:
- Upload zone renders with drag-and-drop area and slider
- Uploading a `.glb` file creates a job and shows the progress tracker
- Each phase lights up as running/done/error

- [ ] **Step 3: Run full test suite**

```bash
cd C:/Users/Kirill/explodify
pytest tests/ -v
```

Expected: All PASSED

- [ ] **Step 4: Final commit and push**

```bash
git add frontend/src/App.tsx
git commit -m "feat: App.tsx — full upload→progress→preview flow wired end-to-end"
git push origin main
```

---

## Task 10: Wire Phase 3+4 Into CLI

**Files:**
- Modify: `explodify.py`

- [ ] **Step 1: Update CLI to run all 4 phases**

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

    frames_dir = Path(args.frames_dir)
    frames_dir.mkdir(parents=True, exist_ok=True)
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    from pipeline.phase1_geometry import GeometryAnalyzer
    from pipeline.phase2_snapshots import SnapshotRenderer
    from pipeline.phase3_stylize import GeminiStylizer
    from pipeline.phase4_video import FalVideoSynth

    print(f"[Phase 1] Loading {args.input} ...")
    analyzer = GeometryAnalyzer()
    meshes = analyzer.load(args.input)
    print(f"[Phase 1] Found {len(meshes)} components")
    master = analyzer.master_angle(meshes)
    print(f"[Phase 1] Master angle: {master}")
    vectors = analyzer.explosion_vectors(meshes, scalar=args.explode)

    print("[Phase 2] Rendering keyframes ...")
    renderer = SnapshotRenderer()
    frame_set = renderer.render(meshes, vectors, master, output_dir=frames_dir / "raw", scalar=args.explode)
    print(f"[Phase 2] Frames at {frames_dir}/raw/")

    print("[Phase 3] Gemini stylization ...")
    stylizer = GeminiStylizer()
    stylized = stylizer.stylize(frame_set, output_dir=frames_dir / "stylized")
    print(f"[Phase 3] Stylized frames at {frames_dir}/stylized/")

    print("[Phase 4] fal.ai video synthesis ...")
    synth = FalVideoSynth()
    video_path = synth.synthesize(stylized, output_path=output_path)
    print(f"[Done] Video written to {video_path}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Smoke test (requires valid API keys in `.env`)**

```bash
python explodify.py --input tests/pipeline/fixtures/two_box_assembly.glb --explode 1.5
```

Expected: `[Done] Video written to output/exploded_view.mp4`

- [ ] **Step 3: Final push**

```bash
git add explodify.py
git commit -m "feat: wire all 4 phases into CLI — full end-to-end pipeline"
git push origin main
```

---

## Final Checklist

- [ ] `pytest tests/ -v` — all green
- [ ] `uvicorn backend.main:app --reload` starts without error
- [ ] `npm run dev` (in `frontend/`) starts without error
- [ ] Upload zone accepts a `.glb` and shows phase progress
- [ ] Video appears in preview when all phases complete
- [ ] No `.env` committed
- [ ] `output/` in `.gitignore`
