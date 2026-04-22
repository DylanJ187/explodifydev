# pipeline/phase4_video.py
"""Phase 4: Apply photorealistic style to the assembled video via fal.ai's
Kling o1 video-to-video edit endpoint.

Strategy: pyrender produces geometrically exact motion (72 frames, Phase 2+3).
Kling's v2v edit preserves that motion structure while applying studio-quality
materials, lighting, and environment.

Single-engine: every render goes through Kling o1. See pricing-model.md
("Render Engine") for why — LTX-2.3 distilled was wired as a cheap tier and
pulled back the same day over quality. If another tier is added back later,
restore the `model_tier` param through this module, `backend/main.py`, and
the frontend (deleted `ModelSelector.tsx` / `ModelSelectionPopover.tsx`).
"""
import asyncio
import os
from pathlib import Path

import fal_client
import httpx

# Kling o1 video-to-video edit. Update this string if fal.ai renames the
# endpoint — this module's single contract with fal.
FAL_ENDPOINT = "fal-ai/kling-video/o1/video-to-video/edit"

# Matches the Phase 3 pyrender output exactly: 72 frames @ 24 fps = 3 seconds.
_BASE_DURATION_S = "3"


class KlingVideoEditor:
    """Phase 4: Upload assembled video → Kling o1 v2v edit → download styled result."""

    def __init__(self, fal_key: str | None = None) -> None:
        key = fal_key or os.environ.get("FAL_KEY", "")
        if not key:
            raise ValueError(
                "FAL_KEY environment variable is required for Phase 4. "
                "Set it in your .env file."
            )
        os.environ["FAL_KEY"] = key

    async def edit(
        self,
        video_path: Path,
        prompt: str,
        output_path: Path,
    ) -> Path:
        """Upload raw video, apply Kling o1 v2v style edit, write result.

        Args:
            video_path:  Path to the mp4 assembled in Phase 3.
            prompt:      Fully assembled prompt from prompt_interpreter.
            output_path: Destination for the styled mp4.

        Returns:
            output_path after writing.
        """
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        print("[Phase 4] Uploading base video to fal.ai storage...")
        video_url = await asyncio.to_thread(
            fal_client.upload_file, str(video_path)
        )
        print(f"[Phase 4] Uploaded -> {video_url}")

        print(f"[Phase 4] Submitting {FAL_ENDPOINT}...")
        print(f"[Phase 4] Prompt: {prompt[:200]}...")

        # Use submit+poll instead of subscribe — Kling o1 runs 5+ min and the
        # SSE stream `subscribe` uses often drops silently, leaving the call
        # blocked forever while the job completes on FAL's side.
        arguments = {
            "prompt": prompt,
            "video_url": video_url,
            "duration": _BASE_DURATION_S,
        }
        handle = await asyncio.to_thread(
            fal_client.submit,
            FAL_ENDPOINT,
            arguments=arguments,
        )
        request_id = handle.request_id
        print(f"[Phase 4] Submitted request_id={request_id}")

        # Poll with exponential backoff, capped at 15s.  Hard timeout 15 min.
        deadline = asyncio.get_event_loop().time() + 15 * 60
        delay = 3.0
        while True:
            if asyncio.get_event_loop().time() > deadline:
                raise TimeoutError(
                    f"Phase 4 timed out after 15m waiting on request_id={request_id}"
                )
            status = await asyncio.to_thread(
                fal_client.status, FAL_ENDPOINT, request_id
            )
            if isinstance(status, fal_client.Completed):
                break
            await asyncio.sleep(delay)
            delay = min(delay * 1.5, 15.0)

        result = await asyncio.to_thread(
            fal_client.result, FAL_ENDPOINT, request_id
        )
        output_url: str = result["video"]["url"]
        file_size = result["video"].get("file_size", 0)
        print(f"[Phase 4] Result ready ({file_size // 1024} KB) → {output_url}")

        async with httpx.AsyncClient(timeout=300) as client:
            resp = await client.get(output_url)
            resp.raise_for_status()
            output_path.write_bytes(resp.content)

        print(f"[Phase 4] Styled video written → {output_path}")
        return output_path
