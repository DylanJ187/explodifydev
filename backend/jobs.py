# backend/jobs.py
import asyncio
import time
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

# Server-side metadata not exposed on JobStatus. Used by the pending-gallery
# registry, autosave flow, and ETA reporting. Keyed by job_id.
_job_meta: dict[str, dict] = {}


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
        eta_seconds=_job_meta.get(job_id, {}).get("eta_seconds"),
        started_at=_job_meta.get(job_id, {}).get("started_at"),
    )


# -- Meta: pending-render tracking, ETA, autosave hints ---------------------


def set_meta(job_id: str, **fields) -> None:
    """Attach arbitrary server-side metadata to a job.

    Used for: ETA seconds, pending gallery entries (source thumb/title),
    autosave intent, replace-on-done target id, and the loop-styling flag.
    """
    entry = dict(_job_meta.get(job_id, {}))
    entry.update(fields)
    if "started_at" not in entry:
        entry["started_at"] = time.time()
    _job_meta[job_id] = entry
    # Mirror eta/started_at onto JobStatus for API consumers.
    job = _jobs.get(job_id)
    if job is not None:
        _jobs[job_id] = job.model_copy(update={
            "eta_seconds": entry.get("eta_seconds"),
            "started_at": entry.get("started_at"),
        })


def get_meta(job_id: str) -> dict:
    return dict(_job_meta.get(job_id, {}))


def clear_meta(job_id: str) -> None:
    _job_meta.pop(job_id, None)


def list_pending_gallery() -> list[dict]:
    """Return active jobs that are earmarked for gallery autosave.

    Each entry carries the source thumbnail + title so the Gallery can render
    a placeholder card while the Kling job runs. Jobs in 'done' or 'error'
    status are excluded — they've either finished saving or been cleared up.
    """
    result: list[dict] = []
    now = time.time()
    for job_id, meta in list(_job_meta.items()):
        if not meta.get("pending_gallery"):
            continue
        job = _jobs.get(job_id)
        if job is None or job.status in ("done", "error"):
            continue
        started = meta.get("started_at") or now
        eta = meta.get("eta_seconds") or 0
        elapsed = max(0.0, now - started)
        remaining = max(0, int(eta - elapsed)) if eta else None
        result.append({
            "job_id": job_id,
            "kind": meta.get("pending_kind", "styled"),
            "source_id": meta.get("source_id"),
            "source_kind": meta.get("source_kind"),
            "title": meta.get("pending_title") or "Styled render",
            "thumbnail_path": meta.get("source_thumbnail_path"),
            "variant": meta.get("pending_variant"),
            "model_tier": meta.get("model_tier"),
            "started_at": started,
            "eta_seconds": eta or None,
            "remaining_seconds": remaining,
            "phase": job.current_phase,
            "status": job.status,
        })
    result.sort(key=lambda e: e["started_at"], reverse=True)
    return result
