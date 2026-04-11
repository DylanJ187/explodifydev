# backend/jobs.py
import uuid
from pathlib import Path

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


def update_phase(job_id: str, phase: int, status: PhaseStatus | str) -> None:
    job = _jobs[job_id]
    phase_status = PhaseStatus(status) if isinstance(status, str) else status
    # Create new dict (immutable pattern)
    new_phases = {**job.phases, phase: phase_status}
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
