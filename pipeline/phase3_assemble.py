# pipeline/phase3_assemble.py
"""Phase 3: Assemble PNG video frames into an mp4 using ffmpeg.

The 72 pyrender frames provide geometrically exact motion — no AI involved.
This mp4 is then passed to Phase 4 (Kling o1 edit) which applies photorealistic
style while preserving the motion exactly.
"""
import subprocess
from pathlib import Path

VIDEO_FPS = 24


class FrameAssembler:
    """Assemble a directory of video_NNNN.png frames into a single mp4."""

    def assemble(
        self,
        frames_dir: Path,
        output_path: Path,
        fps: int = VIDEO_FPS,
    ) -> Path:
        """Run ffmpeg to produce a clean H.264 mp4 from the PNG sequence.

        Args:
            frames_dir:  Directory containing video_0000.png … video_NNNN.png
            output_path: Destination .mp4 path.
            fps:         Frame rate (default 24 — 72 frames = 3 s).

        Returns:
            output_path after writing.
        """
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        pattern = str(frames_dir / "video_%04d.png")

        try:
            subprocess.run(
                [
                    "ffmpeg", "-y",
                    "-r", str(fps),
                    "-i", pattern,
                    "-c:v", "libx264",
                    "-preset", "slow",
                    "-crf", "18",
                    "-pix_fmt", "yuv420p",
                    "-movflags", "+faststart",
                    str(output_path),
                ],
                check=True,
                capture_output=True,
                text=True,
            )
        except subprocess.CalledProcessError as exc:
            raise RuntimeError(
                f"ffmpeg failed assembling frames:\n{exc.stderr[-600:]}"
            ) from exc
        except FileNotFoundError:
            raise RuntimeError(
                "ffmpeg not found. Install with: brew install ffmpeg"
            )

        print(f"[Phase 3] Assembled {fps} fps mp4 → {output_path}")
        return output_path

    def reverse_and_concat(self, forward_path: Path, output_path: Path) -> Path:
        """Produce a 6-second loop: forward.mp4 + time-reversed copy.

        Uses two ffmpeg passes:
          1. Reverse the video using the -vf reverse filter.
          2. Concatenate forward + reversed using the concat demuxer.
        """
        forward_path = Path(forward_path)
        output_path = Path(output_path)
        tmp_reversed = output_path.parent / f"{output_path.stem}_rev_tmp.mp4"
        concat_list = output_path.parent / f"{output_path.stem}_concat.txt"

        # Pass 1: reverse
        subprocess.run(
            [
                "ffmpeg", "-y",
                "-i", str(forward_path),
                "-vf", "reverse",
                "-c:v", "libx264", "-preset", "slow", "-crf", "18",
                "-pix_fmt", "yuv420p",
                str(tmp_reversed),
            ],
            check=True,
            capture_output=True,
        )

        # Pass 2: concat forward + reversed
        concat_list.write_text(
            f"file '{forward_path.resolve()}'\nfile '{tmp_reversed.resolve()}'\n"
        )
        subprocess.run(
            [
                "ffmpeg", "-y",
                "-f", "concat", "-safe", "0",
                "-i", str(concat_list),
                "-c", "copy",
                str(output_path),
            ],
            check=True,
            capture_output=True,
        )

        tmp_reversed.unlink(missing_ok=True)
        concat_list.unlink(missing_ok=True)

        return output_path
