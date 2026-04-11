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
    style_prompt: str = Form(""),
):
    """Accept a CAD file upload + style prompt, create a background job, return job_id."""
    job_id = jobs.create_job()

    # Save uploaded file using the job_id as filename
    suffix = Path(file.filename or "upload.glb").suffix
    tmp_path = UPLOAD_DIR / f"{job_id}{suffix}"
    content = await file.read()
    tmp_path.write_bytes(content)

    # Fire-and-forget background task
    asyncio.create_task(
        _run_pipeline(job_id, tmp_path, explode_scalar, style_prompt)
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


async def _run_pipeline(
    job_id: str, cad_path: Path, scalar: float, style_prompt: str = ""
) -> None:
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
            renderer.render, meshes, vectors, master,
            output_dir / "raw", scalar, style_prompt   # style_prompt carried into FrameSet
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
        current_job = jobs.get_job(job_id)
        phase = current_job.current_phase if current_job else 1
        jobs.mark_error(job_id, phase, str(e))
