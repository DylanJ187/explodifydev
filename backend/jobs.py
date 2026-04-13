# backend/jobs.py
import asyncio
import uuid

from backend.models import JobStatus, PhaseStatus

PHASE_NAMES = {
    1: "Geometric analysis",
    2: "Rendering frames",
    3: "Assembling video",
    4: "Kling style edit",
}

# In-memory store: job_id -> JobStatus
_jobs: dict[str, JobStatus] = {}

# Per-job events used to unblock Phase 4 after user approval.
_approval_events: dict[str, asyncio.Event] = {}

# Style overrides submitted at approval time.
_approval_style: dict[str, dict] = {}

# Which variants the user selected for styling: ["longest", "shortest"], or both.
_approval_variants: dict[str, list[str]] = {}


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


def update_phase(job_id: str, phase: int, status: PhaseStatus | str) -> None:
    job = _jobs[job_id]
    phase_status = PhaseStatus(status) if isinstance(status, str) else status
    new_phases = {**job.phases, phase: phase_status}
    _jobs[job_id] = JobStatus(
        job_id=job_id,
        status="running",
        current_phase=phase,
        current_phase_name=PHASE_NAMES[phase],
        phases=new_phases,
        error=job.error,
        has_dual_variants=job.has_dual_variants,
    )


def mark_awaiting_approval(job_id: str) -> asyncio.Event:
    """Pause pipeline after Phase 3; return an Event the caller should await."""
    new_phases = {**_jobs[job_id].phases}
    _jobs[job_id] = JobStatus(
        job_id=job_id,
        status="awaiting_approval",
        current_phase=3,
        current_phase_name=PHASE_NAMES[3],
        phases=new_phases,
        has_dual_variants=_jobs[job_id].has_dual_variants,
    )
    event = asyncio.Event()
    _approval_events[job_id] = event
    return event


def approve_phase4(
    job_id: str,
    style_overrides: dict | None = None,
    selected_variants: list[str] | None = None,
) -> bool:
    """Signal Phase 4 to proceed. Returns False if no pending approval exists."""
    event = _approval_events.pop(job_id, None)
    if event is None:
        return False
    if style_overrides:
        _approval_style[job_id] = style_overrides
    if selected_variants:
        _approval_variants[job_id] = selected_variants
    event.set()
    return True


def get_approval_style(job_id: str) -> dict | None:
    """Pop and return style overrides submitted at approval time, if any."""
    return _approval_style.pop(job_id, None)


def get_approval_variants(job_id: str) -> list[str]:
    """Pop and return selected variants. Defaults to both if none specified."""
    return _approval_variants.pop(job_id, ["longest", "shortest"])


def mark_done(job_id: str, _unused: None = None, ai_styled: bool = False) -> None:
    new_phases = {i: PhaseStatus.done for i in range(1, 5)}
    _jobs[job_id] = JobStatus(
        job_id=job_id,
        status="done",
        current_phase=4,
        current_phase_name=PHASE_NAMES[4],
        phases=new_phases,
        ai_styled=ai_styled,
        has_dual_variants=_jobs[job_id].has_dual_variants,
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
        has_dual_variants=job.has_dual_variants,
    )
