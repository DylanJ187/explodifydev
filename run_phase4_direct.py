"""
Direct Phase 4 runner — skips Phase 1/2/3, feeds 3 images straight into FalVideoSynth.
"""
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
load_dotenv()  # reads FAL_KEY from .env

from pipeline.models import FrameSet, PipelineMetadata
from pipeline.phase4_video import FalVideoSynth

FRAME_A = Path(r"C:\Users\Kirill\OneDrive\Pictures\Screenshots\TEst 1.png")
FRAME_B = Path(r"C:\Users\Kirill\OneDrive\Pictures\Screenshots\test 2.png")
FRAME_C = Path(r"C:\Users\Kirill\OneDrive\Pictures\Screenshots\test 3.png")

STYLE_PROMPT = "smooth cinematic product reveal, dark background"

OUTPUT_PATH = Path("output/explodify_direct.mp4")
OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)

# Validate files exist
for p in (FRAME_A, FRAME_B, FRAME_C):
    if not p.exists():
        print(f"ERROR: file not found: {p}")
        sys.exit(1)
    print(f"  found: {p.name}")

frame_set = FrameSet(
    frame_a=FRAME_A,
    frame_b=FRAME_B,
    frame_c=FRAME_C,
    metadata=PipelineMetadata(
        master_angle="front",
        explosion_scalar=1.0,
        component_count=3,
        camera_angles_deg=[0.0, 15.0, 30.0],
        style_prompt=STYLE_PROMPT,
    ),
)

print(f"\n[Phase 4] Generating clip 1 (assembled -> mid-explode) ...")
print(f"[Phase 4] Generating clip 2 (mid-explode -> fully exploded) ...")
print(f"[Phase 4] Prompt: {STYLE_PROMPT}")
print(f"[Phase 4] This takes ~2-3 minutes per clip ...\n")

synth = FalVideoSynth()
video_path = synth.synthesize(frame_set, output_path=OUTPUT_PATH)

print(f"\n[Done] Video written to: {video_path.resolve()}")
