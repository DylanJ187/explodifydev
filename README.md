# Explodify

**Explodify** turns any CAD assembly file into a photorealistic exploded-view animation — automatically.

> Built at the [Tech: Europe] London AI Hackathon 2026

---

## What It Does

1. **Geometric Analysis** — Loads your CAD/mesh file, ray-casts from 6 directions to find the most informative viewing angle, then computes per-component explosion vectors from the assembly centroid.
2. **Structural Snapshots** — Renders 3 clean PNG frames at 0%, 50%, and 100% explosion with a slight camera orbit.
3. **AI Stylization** — Feeds those snapshots into Gemini Flash image editing to produce photorealistic "Blender Cycles" renders while preserving geometry.
4. **Video Synthesis** — Uploads the three keyframes to fal.ai (Kling/Luma) with start/middle/end anchoring to produce a smooth MP4 animation.

---

## Pipeline

```
CAD file (.glb / .obj / .stl)
    │
    ▼
Phase 1: Trimesh — Optimal angle + explosion vectors
    │
    ▼
Phase 2: pyrender — 3 silhouette PNG snapshots
    │
    ▼
Phase 3: Gemini Flash — Image-to-image photorealistic stylization
    │
    ▼
Phase 4: fal.ai (Kling/Luma) — Keyframe-anchored video interpolation
    │
    ▼
Output: exploded_view.mp4
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Geometry | [Trimesh](https://trimesh.org/) |
| Rendering | [pyrender](https://pyrender.readthedocs.io/) |
| AI Stylization | [Gemini Flash](https://deepmind.google/technologies/gemini/) (Google Deepmind) |
| Video Synthesis | [fal.ai](https://fal.ai/) — Kling / Luma |
| Backend | Python 3.11+ |
| Frontend | (TBD — CLI / Gradio / web) |

---

## Quickstart

```bash
# Clone
git clone https://github.com/kpuchkov1-code/explodify.git
cd explodify

# Install
pip install -r requirements.txt

# Run
python explodify.py --input examples/assembly.glb --explode 1.5
```

---

## Partner Technologies Used

- **Google Deepmind / Gemini** — image stylization (Phase 3)
- **fal.ai** — video synthesis with keyframe anchoring (Phase 4)

---

## Hackathon

Built at **Tech: Europe London AI Hackathon** | April 2026  
Track: Open Innovation + Best use of fal.ai side challenge

---

## License

MIT
