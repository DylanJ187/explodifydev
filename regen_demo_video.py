"""Regenerate samples/final_video.mp4 using Kling o1 standard (quality) variant.

Run once to update the bundled demo asset.  Not part of the live pipeline.

Usage:
    cd /tmp/Explodify
    python regen_demo_video.py
"""
import asyncio
import os
from pathlib import Path

from dotenv import load_dotenv
load_dotenv()

from pipeline.phase4_video import KlingVideoEditor
from pipeline.prompt_interpreter import build_fal_prompt

BASE_VIDEO = Path("samples/base_video.mp4")
OUTPUT = Path("samples/final_video.mp4")

PROMPT = build_fal_prompt(
    material_prompt="brushed aluminium body, matte black plastic cap, clear polycarbonate window",
    style_prompt="",
    lighting="studio",
    backdrop="dark",
)


async def main() -> None:
    if not BASE_VIDEO.exists():
        raise FileNotFoundError(f"Base video not found: {BASE_VIDEO}")

    print(f"Input:  {BASE_VIDEO} ({BASE_VIDEO.stat().st_size // 1024} KB)")
    print(f"Output: {OUTPUT}")
    print(f"Model:  Kling o1 standard (quality)")
    print()

    editor = KlingVideoEditor()
    result = await editor.edit(BASE_VIDEO, PROMPT, OUTPUT)
    print(f"\nDone -> {result} ({result.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    asyncio.run(main())
