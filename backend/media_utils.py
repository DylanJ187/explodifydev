# backend/media_utils.py
"""Thin ffmpeg/ffprobe wrappers for gallery-adjacent operations.

- Thumbnails for gallery cards
- Duration probes to populate GalleryItem.duration_s
"""
from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Optional


def extract_thumbnail(video_path: Path, output_path: Path, at_seconds: float = 0.5) -> Optional[Path]:
    """Grab a single frame at `at_seconds` and save it as a JPEG.

    Returns output_path on success, None on failure (never raises — a missing
    thumbnail is not fatal for gallery display).
    """
    video_path = Path(video_path)
    output_path = Path(output_path)
    if not video_path.exists():
        return None
    output_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        subprocess.run(
            [
                "ffmpeg", "-y",
                "-ss", f"{at_seconds:.3f}",
                "-i", str(video_path),
                "-frames:v", "1",
                "-q:v", "4",
                "-vf", "scale=480:-2",
                str(output_path),
            ],
            check=True,
            capture_output=True,
        )
        return output_path if output_path.exists() else None
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None


def probe_duration(video_path: Path) -> Optional[float]:
    """Return duration in seconds, or None if probe fails."""
    video_path = Path(video_path)
    if not video_path.exists():
        return None
    try:
        out = subprocess.run(
            [
                "ffprobe", "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                str(video_path),
            ],
            check=True, capture_output=True, text=True,
        )
        return float(out.stdout.strip())
    except (subprocess.CalledProcessError, FileNotFoundError, ValueError):
        return None


def concat_videos(inputs: list[Path], output_path: Path) -> Path:
    """Concatenate multiple mp4 clips into one via the ffmpeg concat demuxer.

    All inputs must share codec/resolution. For heterogeneous inputs the
    caller should re-encode them first (not yet needed — our clips are all
    produced by the same libx264 pipeline and share resolution).

    Raises RuntimeError on failure.
    """
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if not inputs:
        raise ValueError("concat_videos requires at least one input clip")

    listfile = output_path.parent / f".{output_path.stem}_concat.txt"
    lines = [f"file '{Path(p).resolve()}'" for p in inputs]
    listfile.write_text("\n".join(lines) + "\n")

    try:
        # Re-encode to ensure compatibility — the cost is small (<5s) and avoids
        # crashes when clips disagree on SPS/PPS or timing.
        subprocess.run(
            [
                "ffmpeg", "-y",
                "-f", "concat", "-safe", "0",
                "-i", str(listfile),
                "-c:v", "libx264", "-preset", "medium", "-crf", "20",
                "-pix_fmt", "yuv420p",
                "-movflags", "+faststart",
                str(output_path),
            ],
            check=True, capture_output=True, text=True,
        )
    except subprocess.CalledProcessError as exc:
        raise RuntimeError(
            f"ffmpeg concat failed:\n{exc.stderr[-600:]}"
        ) from exc
    except FileNotFoundError:
        raise RuntimeError("ffmpeg not found. Install with: brew install ffmpeg")
    finally:
        listfile.unlink(missing_ok=True)

    return output_path
