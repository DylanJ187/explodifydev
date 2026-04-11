#!/usr/bin/env python3
"""Re-render samples/final_video.mp4 using the current Phase 4 pipeline.

Run from the project root:
    PYTHONPATH=. python scripts/rerender_demo.py
"""
import asyncio
import os
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv
load_dotenv(ROOT / ".env")

from pipeline.prompt_interpreter import build_fal_prompt
from pipeline.phase4_video import KlingVideoEditor

BASE_VIDEO  = ROOT / "samples" / "base_video.mp4"
OUTPUT_PATH = ROOT / "samples" / "final_video.mp4"

# Style options that will also be pre-populated in the UI for demo mode.
# Keep in sync with DEMO_STYLE in frontend/src/App.tsx.
DEMO_MATERIAL = "brushed aluminium body with machined surfaces, matte black plastic accents, polished metal fasteners"
DEMO_STYLE_NOTES = ""
DEMO_LIGHTING   = "studio"    # three-point softbox
DEMO_BACKDROP   = "dark"      # near-black with faint reflections
DEMO_SHADOW     = True


async def main() -> None:
    fal_key = os.environ.get("FAL_KEY", "")
    if not fal_key:
        print("ERROR: FAL_KEY not set in .env")
        sys.exit(1)

    if not BASE_VIDEO.exists():
        print(f"ERROR: base video not found at {BASE_VIDEO}")
        sys.exit(1)

    prompt = build_fal_prompt(
        material_prompt=DEMO_MATERIAL,
        style_prompt=DEMO_STYLE_NOTES,
        lighting=DEMO_LIGHTING,
        backdrop=DEMO_BACKDROP,
        ground_shadow=DEMO_SHADOW,
    )

    print(f"Prompt ({len(prompt)} chars):")
    print(prompt)
    print()

    editor = KlingVideoEditor(fal_key=fal_key)
    result = await editor.edit(BASE_VIDEO, prompt, OUTPUT_PATH)
    print(f"\nDone → {result}")


if __name__ == "__main__":
    asyncio.run(main())
