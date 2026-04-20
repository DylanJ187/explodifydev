# pipeline/phase4_video.py
"""Phase 4: Apply photorealistic style to the assembled video via a Kling
video-to-video edit endpoint on fal.ai.

Strategy: pyrender produces geometrically exact motion (72 frames, Phase 2+3).
The Kling edit preserves that motion structure while applying studio-quality
materials, lighting, and environment.

The user picks a model tier (Standard / High Quality / Premium) which maps to
a specific Kling endpoint and credit cost (see pricing-model.md). The prompt
is built upstream by pipeline.prompt_interpreter; this module only handles the
FAL API interaction (upload, submit, download).
"""
import asyncio
import os
from pathlib import Path

import fal_client
import httpx

# Tier → fal.ai endpoint map.
# Premium (Kling o1) is the confirmed-working endpoint. Standard (Kling 3.0)
# and High Quality (Kling 2.5 Pro) use the analogous v2v paths. Update these
# strings if fal.ai renames an endpoint — they are the only thing this module
# cares about at call time.
FAL_ENDPOINTS: dict[str, str] = {
    "premium":      "fal-ai/kling-video/o1/video-to-video/edit",
    "high_quality": "fal-ai/kling-video/v2.5-pro/video-to-video",
    "standard":     "fal-ai/kling-video/v3/standard/video-to-video",
}

DEFAULT_TIER = "premium"


def resolve_endpoint(model_tier: str | None) -> str:
    """Return the fal.ai endpoint for the requested tier, defaulting to Premium."""
    tier = (model_tier or DEFAULT_TIER).lower()
    return FAL_ENDPOINTS.get(tier, FAL_ENDPOINTS[DEFAULT_TIER])


class KlingVideoEditor:
    """Phase 4: Upload assembled video → Kling edit → download styled result."""

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
        model_tier: str | None = None,
    ) -> Path:
        """Upload raw video, apply Kling style edit at the given tier, write result.

        Args:
            video_path:  Path to the mp4 assembled in Phase 3.
            prompt:      Fully assembled prompt from prompt_interpreter.
            output_path: Destination for the styled mp4.
            model_tier:  "standard" | "high_quality" | "premium" (default).

        Returns:
            output_path after writing.
        """
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        endpoint = resolve_endpoint(model_tier)

        print("[Phase 4] Uploading base video to fal.ai storage...")
        video_url = await asyncio.to_thread(
            fal_client.upload_file, str(video_path)
        )
        print(f"[Phase 4] Uploaded -> {video_url}")

        print(f"[Phase 4] Submitting {endpoint} (tier={model_tier or DEFAULT_TIER})...")
        print(f"[Phase 4] Prompt: {prompt[:200]}...")

        # duration="3" matches the 72-frame 24fps base video exactly.
        # Omitting it lets Kling default to 5s and stretch the motion.
        # Use submit+poll instead of subscribe — Kling o1 runs 5+ min and the
        # SSE stream `subscribe` uses often drops silently, leaving the call
        # blocked forever while the job completes on FAL's side.
        handle = await asyncio.to_thread(
            fal_client.submit,
            endpoint,
            arguments={
                "prompt": prompt,
                "video_url": video_url,
                "duration": "3",
            },
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
                fal_client.status, endpoint, request_id
            )
            if isinstance(status, fal_client.Completed):
                break
            await asyncio.sleep(delay)
            delay = min(delay * 1.5, 15.0)

        result = await asyncio.to_thread(
            fal_client.result, endpoint, request_id
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
