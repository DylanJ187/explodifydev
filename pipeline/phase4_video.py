# pipeline/phase4_video.py
import base64
import os
import tempfile
from pathlib import Path
from typing import List

import fal_client
import requests

from pipeline.models import FrameSet

FAL_MODEL = "fal-ai/kling-video/o1/image-to-video"
CLIP_DURATION = "5"   # seconds per clip
CROSSFADE_SECS = 1.0  # overlap duration for seamless blending between clips
DEFAULT_VIDEO_PROMPT = (
    "Smooth mechanical disassembly. Components maintain exact shape and scale "
    "while translating outward along straight paths. Studio lighting, dark background."
)


def _build_video_prompt(style_prompt: str) -> str:
    """Combine user's aesthetic with the motion description."""
    motion = (
        "Smooth linear translation only. Each component maintains exact size, shape, "
        "and orientation while moving outward. Steady locked-off camera."
    )
    aesthetic = style_prompt.strip() if style_prompt.strip() else DEFAULT_VIDEO_PROMPT
    return f"{motion} {aesthetic}"


class FalVideoSynth:
    """Phase 4: Generate video from keyframes using fal.ai Kling O1 interpolation."""

    def __init__(self, fal_key: str | None = None):
        key = fal_key or os.environ.get("FAL_KEY", "")
        os.environ["FAL_KEY"] = key  # fal_client reads from env

    def synthesize(self, stylized_frames: FrameSet, output_path: Path) -> Path:
        """Legacy 3-frame entry point. Delegates to synthesize_frames."""
        frames = [stylized_frames.frame_a, stylized_frames.frame_b, stylized_frames.frame_c]
        return self.synthesize_frames(
            frames,
            output_path,
            style_prompt=stylized_frames.metadata.style_prompt,
        )

    def synthesize_frames(
        self,
        frame_paths: List[Path],
        output_path: Path,
        style_prompt: str = "",
    ) -> Path:
        """Generate video from N keyframes (N >= 2). Produces N-1 clips, crossfaded.

        Args:
            frame_paths: Ordered list of keyframe image paths.
            output_path: Path to write the final .mp4.
            style_prompt: Aesthetic description for the video prompt.

        Returns:
            output_path after writing.
        """
        if len(frame_paths) < 2:
            raise ValueError("Need at least 2 frames to generate a video")

        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        video_prompt = _build_video_prompt(style_prompt)
        n_clips = len(frame_paths) - 1

        # Convert all frames to data URIs up front.
        uris = [self._to_data_uri(p) for p in frame_paths]

        # Generate each clip.
        clips: List[bytes] = []
        for i in range(n_clips):
            print(f"[Phase 4] Generating clip {i + 1}/{n_clips} "
                  f"(frame {i + 1} -> frame {i + 2}) ...")
            clip_bytes = self._generate_clip(uris[i], uris[i + 1], video_prompt)
            clips.append(clip_bytes)

        # Stitch all clips with crossfade.
        return self._stitch_clips_multi(clips, output_path)

    def _to_data_uri(self, frame_path: Path) -> str:
        """Convert image file to base64 data URI for fal.ai upload."""
        path = Path(frame_path)
        suffix = path.suffix.lower().lstrip(".")
        mime = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg"}.get(
            suffix, "image/png"
        )
        with open(path, "rb") as f:
            data = base64.b64encode(f.read()).decode()
        return f"data:{mime};base64,{data}"

    def _generate_clip(self, start_image_url: str, end_image_url: str, prompt: str) -> bytes:
        """Call fal.ai Kling O1 to interpolate between two keyframes. Returns video bytes."""
        result = fal_client.subscribe(
            FAL_MODEL,
            arguments={
                "prompt": prompt,
                "start_image_url": start_image_url,
                "end_image_url": end_image_url,
                "duration": CLIP_DURATION,
                "aspect_ratio": "16:9",
            },
        )
        video_url = result["video"]["url"]
        resp = requests.get(video_url, timeout=120)
        resp.raise_for_status()
        return resp.content

    def _stitch_clips_multi(self, clips: List[bytes], output_path: Path) -> Path:
        """Crossfade-stitch N clips into one seamless video.

        Each clip is normalized to 1920x1080/24fps/yuv420p first, then chained
        through sequential xfade filters.
        """
        import subprocess

        if len(clips) == 1:
            output_path.write_bytes(clips[0])
            return output_path

        # Write raw clips to temp files.
        raw_paths = []
        for i, clip_bytes in enumerate(clips):
            f = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
            f.write(clip_bytes)
            f.close()
            raw_paths.append(f.name)

        # Normalize all clips to matching format.
        norm_paths = []
        for raw in raw_paths:
            norm = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False).name
            subprocess.run(
                [
                    "ffmpeg", "-y", "-i", raw,
                    "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease,"
                           "pad=1920:1080:(ow-iw)/2:(oh-ih)/2,format=yuv420p",
                    "-r", "24",
                    "-c:v", "libx264", "-preset", "fast", "-crf", "18",
                    "-an", norm,
                ],
                check=True, capture_output=True, text=True,
            )
            norm_paths.append(norm)

        # Probe each clip's duration.
        durations = []
        for norm in norm_paths:
            probe = subprocess.run(
                [
                    "ffprobe", "-v", "error",
                    "-show_entries", "format=duration",
                    "-of", "default=noprint_wrappers=1:nokey=1",
                    norm,
                ],
                capture_output=True, text=True, check=True,
            )
            durations.append(float(probe.stdout.strip()))

        try:
            # Build chained xfade filter graph for N clips.
            # For 4 clips: [0][1]xfade -> [v1]; [v1][2]xfade -> [v2]; [v2][3]xfade -> [v]
            inputs = []
            for norm in norm_paths:
                inputs.extend(["-i", norm])

            filter_parts = []
            cumulative_offset = 0.0
            for i in range(len(norm_paths) - 1):
                if i == 0:
                    src_a = "[0:v]"
                else:
                    src_a = f"[v{i}]"

                src_b = f"[{i + 1}:v]"
                cumulative_offset = (
                    sum(durations[:i + 1]) - CROSSFADE_SECS * i
                    - CROSSFADE_SECS
                )
                offset = max(0, cumulative_offset)

                if i == len(norm_paths) - 2:
                    out_label = "[v]"
                else:
                    out_label = f"[v{i + 1}]"

                filter_parts.append(
                    f"{src_a}{src_b}xfade=transition=fade:"
                    f"duration={CROSSFADE_SECS}:offset={offset},"
                    f"format=yuv420p{out_label}"
                )

            filter_complex = ";".join(filter_parts)

            cmd = ["ffmpeg", "-y"] + inputs + [
                "-filter_complex", filter_complex,
                "-map", "[v]",
                "-c:v", "libx264",
                "-preset", "slow",
                "-crf", "18",
                str(output_path),
            ]

            subprocess.run(cmd, check=True, capture_output=True, text=True)
            total_dur = sum(durations) - CROSSFADE_SECS * (len(clips) - 1)
            print(f"[Phase 4] Crossfade stitch complete ({total_dur:.1f}s, {len(clips)} clips)")

        except (subprocess.CalledProcessError, FileNotFoundError) as exc:
            stderr = getattr(exc, "stderr", "") or ""
            print(f"[Phase 4] xfade failed, falling back to concat ...")
            if stderr:
                print(f"[Phase 4] ffmpeg: {stderr[:500]}")

            concat_list = tempfile.NamedTemporaryFile(
                mode="w", suffix=".txt", delete=False
            )
            for raw in raw_paths:
                concat_list.write(f"file '{raw}'\n")
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
                    check=True, capture_output=True,
                )
            except (subprocess.CalledProcessError, FileNotFoundError):
                output_path.write_bytes(clips[0])

        return output_path
