"""
Direct Phase 4 runner for 5 keyframes — generates 4 clips crossfaded into one video.
"""
import sys
from pathlib import Path

from dotenv import load_dotenv
load_dotenv()

from pipeline.phase4_video import FalVideoSynth

# 5 keyframes: frame 1 = intact, frame 5 = fully exploded
FRAMES = [
    Path(r"C:\Users\Kirill\OneDrive\Pictures\Bottle 1.jpeg"),
    Path(r"C:\Users\Kirill\OneDrive\Pictures\Bottle 2.jpeg"),
    Path(r"C:\Users\Kirill\OneDrive\Pictures\Bottle 3.jpeg"),
    Path(r"C:\Users\Kirill\OneDrive\Pictures\Bottle 4.jpeg"),
    Path(r"C:\Users\Kirill\OneDrive\Pictures\Bottle 5.jpeg"),
]

STYLE_PROMPT = "smooth cinematic product reveal, dark background"
OUTPUT_PATH = Path("output/bottle_explode.mp4")

# Validate all frames exist.
for p in FRAMES:
    if not p.exists():
        print(f"ERROR: file not found: {p}")
        sys.exit(1)
    print(f"  found: {p.name}")

print(f"\n[Phase 4] {len(FRAMES)} keyframes -> {len(FRAMES) - 1} clips")
print(f"[Phase 4] Prompt: {STYLE_PROMPT}")
print(f"[Phase 4] This takes ~2-3 minutes per clip ...\n")

synth = FalVideoSynth()
video_path = synth.synthesize_frames(
    FRAMES,
    output_path=OUTPUT_PATH,
    style_prompt=STYLE_PROMPT,
)

print(f"\n[Done] Video written to: {video_path.resolve()}")
