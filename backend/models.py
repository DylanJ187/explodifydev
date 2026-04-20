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
    status: str               # "queued" | "running" | "awaiting_approval" | "done" | "error"
    current_phase: int        # 1–4
    current_phase_name: str
    phases: dict[int, PhaseStatus]
    error: Optional[str] = None
    ai_styled: bool = False   # True when at least one styled video was produced
    has_dual_variants: bool = True
    eta_seconds: Optional[int] = None   # Estimated total runtime when available
    started_at: Optional[float] = None  # Unix seconds when ETA countdown began
