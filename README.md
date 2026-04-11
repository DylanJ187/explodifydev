# Explodify

**Explodify** turns any CAD assembly file into a photorealistic, market-ready exploded-view animation — automatically.

> Built at the **[Tech: Europe] London AI Hackathon 2026**

---

## The Idea

Product teams spend thousands on Blender artists to produce exploded-view ads for hardware products. Explodify eliminates that bottleneck: upload a `.step` / `.glb` / `.obj` file, choose your orientation, and receive a studio-grade animated video in minutes.

The key insight is a **geometric-first** approach: rather than asking an AI to "guess" how parts come apart, we use Trimesh to compute mathematically correct explosion vectors from a user-confirmed viewing angle, render 72 precise frames with pyrender, assemble them into a base video with ffmpeg, then hand that video to Kling o1 for photorealistic stylization. The AI never has to invent geometry it cannot see.

---

## Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│  INPUT: CAD file  (.step / .glb / .obj / .stl / .ply / .3mf)   │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
          ╔══════════════════════════════════╗
          ║   ORIENTATION PREVIEW            ║
          ║   POST /preview                  ║
          ╠══════════════════════════════════╣
          ║  1. Load mesh (cascadio / trimesh)║
          ║  2. Reorient: longest axis → Y-up ║
          ║  3. Render 6 face screenshots     ║
          ║     512×288 px · 16:9 · pyrender  ║
          ║     front / back / left / right   ║
          ║     top / bottom                  ║
          ║  4. Return base64 PNGs + preview_id║
          ╚══════════════════════════════════╝
                               │
                    User picks front face
                    + sets roll offset (0–350°)
                    + configures style panel
                               │
                               ▼
          ╔══════════════════════════════════╗
          ║   PHASE 1 · GEOMETRY             ║
          ║   Trimesh + cascadio             ║
          ╠══════════════════════════════════╣
          ║  1. Load assembly; extract named  ║
          ║     mesh components               ║
          ║  2. Reorient: longest axis → Y-up ║
          ║  3. Compute assembly centroid     ║
          ║  4. Per-component explosion vector║
          ║     v = (c_part − c_assembly)     ║
          ║         × explode_scalar          ║
          ╚══════════════════════════════════╝
                               │
                               ▼
          ╔══════════════════════════════════╗
          ║   PHASE 2 · RENDER               ║
          ║   pyrender · OpenGL headless     ║
          ╠══════════════════════════════════╣
          ║  72 frames · 1920×1080 · 24 fps  ║
          ║                                  ║
          ║  Camera:                         ║
          ║  • Placed along selected face dir ║
          ║  • Roll corrected via Rodrigues   ║
          ║  • Distance from 2D view-plane    ║
          ║    footprint (correct zoom at any ║
          ║    aspect ratio)                  ║
          ║  • Orbits 0° → orbit_range_deg    ║
          ║    across 72 frames (default 40°) ║
          ║                                  ║
          ║  Explosion: 0% → 100% linearly   ║
          ║  across all 72 frames            ║
          ╚══════════════════════════════════╝
                               │
                               ▼
          ╔══════════════════════════════════╗
          ║   PHASE 3 · ASSEMBLE             ║
          ║   ffmpeg                         ║
          ╠══════════════════════════════════╣
          ║  72 PNG frames → base_video.mp4  ║
          ║  3 seconds · 24 fps · H.264      ║
          ╚══════════════════════════════════╝
                               │
                               ▼
          ╔══════════════════════════════════╗
          ║   REVIEW GATE                    ║
          ╠══════════════════════════════════╣
          ║  User watches base video in the  ║
          ║  browser. Style panel stays live ║
          ║  — materials and lighting can    ║
          ║  still be adjusted here.         ║
          ║  FAL credits not spent yet.      ║
          ╚══════════════════════════════════╝
                               │
                    User clicks "Proceed to AI Styling"
                    Style params locked in at this point
                               │
                               ▼
          ╔══════════════════════════════════╗
          ║   PHASE 4 · AI STYLIZATION       ║
          ║   Kling o1 · fal.ai              ║
          ╠══════════════════════════════════╣
          ║  1. Upload base_video.mp4 to     ║
          ║     fal.ai storage               ║
          ║                                  ║
          ║  2. Build prompt (~700 chars):   ║
          ║     "SURFACE RESTYLE ONLY"       ║
          ║     → materials (user or default)║
          ║     → lighting preset            ║
          ║     → backdrop preset            ║
          ║     → style notes (optional)     ║
          ║     → negative constraints       ║
          ║     → geometry-lock close        ║
          ║                                  ║
          ║  3. Call Kling o1 video-to-video ║
          ║     edit with duration="3"       ║
          ║     (explicit — default is 5s,   ║
          ║     which distorts the motion)   ║
          ║                                  ║
          ║  4. Download → final_video.mp4   ║
          ╚══════════════════════════════════╝
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  OUTPUT: final_video.mp4  — studio-grade exploded-view animation│
│  Served via GET /jobs/{id}/video                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Supported Input Formats

### What works well

| Format | How to export | Why it works |
|--------|--------------|--------------|
| **STEP / STP** | SolidWorks: *File → Save As → STEP AP214*, tick **Export as assembly**<br>Fusion 360: *File → Export → STEP*, ensure components are not merged<br>Onshape: *Export → STEP*, select *Export each part as a separate body* | Preserves named assembly components when exported correctly |
| **GLB / GLTF** | Blender: *File → Export → glTF 2.0*<br>Fusion 360: *File → Export → OBJ or GLB* | Scene graph nodes become individual components |
| **OBJ + MTL** | Tinkercad: *Export → OBJ*<br>Blender: *File → Export → Wavefront OBJ* | Material groups become components; MTL colors are preserved |
| **STL** | Any CAD tool: *File → Save As → STL* | Single mesh only — best for simple parts |
| **PLY / 3MF** | Blender, MeshLab | Supported, single mesh |

### What does NOT work

| Situation | Error | Fix |
|-----------|-------|-----|
| STEP exported as a single solid (no assembly tree) | `>100 components` error | Re-export with assembly structure enabled |
| Proprietary formats (`.sldasm`, `.sldprt`, `.f3d`, `.ipt`) | Unsupported format error | Export to STEP or GLB from your CAD tool |
| More than 100 components after loading | `>100 components` error | File was tessellated per-face; re-export with assembly structure |

### Ideal input checklist

- [ ] File is STEP, GLB, or OBJ
- [ ] Assembly has **2–50 distinct parts** (not faces/surfaces)
- [ ] Each part is a separate mesh node or material group
- [ ] File size under ~50 MB

---

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Liveness check |
| `GET` | `/preview/sample` | Render 6 orientation views of the bundled sample model |
| `POST` | `/preview` | Upload a CAD file; receive 6 face screenshots + `preview_id` |
| `POST` | `/jobs` | Create explode job from `preview_id` + style + camera parameters |
| `GET` | `/jobs/{id}` | Poll job status (`queued` / `running` / `awaiting_approval` / `done` / `error`) |
| `POST` | `/jobs/{id}/approve` | Approve Phase 4 (Kling AI); optionally submit updated style overrides |
| `GET` | `/jobs/{id}/base_video` | Fetch the raw 72-frame assembled mp4 (available once Phase 3 is done) |
| `GET` | `/jobs/{id}/video` | Fetch the final styled mp4 (Phase 4), falls back to base video if not styled |
| `GET` | `/jobs/{id}/frames/{name}` | Fetch a keyframe PNG (`frame_a` … `frame_e`) |
| `POST` | `/demo` | Load a pre-rendered demo job (no pipeline, uses bundled sample videos) |

### POST /preview — response

```json
{
  "preview_id": "uuid",
  "images": {
    "front":  "data:image/png;base64,...",
    "back":   "data:image/png;base64,...",
    "left":   "data:image/png;base64,...",
    "right":  "data:image/png;base64,...",
    "top":    "data:image/png;base64,...",
    "bottom": "data:image/png;base64,..."
  }
}
```

### POST /jobs — form fields

```
preview_id           string   UUID from /preview (file reused, no re-upload)
master_angle         string   front | back | left | right | top | bottom
rotation_offset_deg  float    0–350 in steps of 5 (camera roll correction)
orbit_range_deg      float    total camera orbit across 72 frames (default 40, max 60)
explode_scalar       float    explosion magnitude multiplier (default 1.5)
material_prompt      string   free-text material description (e.g. "brushed aluminium body")
style_prompt         string   free-text style notes (e.g. "warm amber tone")
studio_lighting      bool     three-point product lighting (default true)
dark_backdrop        bool     near-black studio backdrop
white_backdrop       bool     infinite white cyclorama
warm_tone            bool     warm 3800K key light
cold_tone            bool     cool 6500K clinical lighting
ground_shadow        bool     ground-plane shadow/reflection (default true)
```

### POST /jobs/{id}/approve — form fields

All fields are optional. If provided, they override the values submitted at job creation time, allowing the user to tweak style while reviewing the base video.

```
material_prompt      string
style_prompt         string
studio_lighting      bool (as string "true"/"false")
dark_backdrop        bool
white_backdrop       bool
warm_tone            bool
cold_tone            bool
ground_shadow        bool
```

---

## Style → Kling Prompt Chain

User style inputs are assembled into a structured prompt by `pipeline/prompt_interpreter.py` before being sent to Kling.

**Design principle:** Kling o1 has no `strength` parameter — the prompt is the only fidelity control. Shorter, imperative prompts that lead with "do not change X" outperform elaborate scene descriptions. The template stays under ~700 chars.

**Prompt structure (7 sections):**

1. **Geometry lock (open)** — `"SURFACE RESTYLE ONLY. Do not alter any geometry..."` — first tokens carry the highest weight
2. **Materials** — user `material_prompt` with PBR grounding, or sensible defaults; prefixed with named mesh components so Kling can map materials to specific parts
3. **Lighting preset** — resolved from `studio_lighting` / `warm_tone` / `cold_tone` toggles
4. **Backdrop** — resolved from `dark_backdrop` / `white_backdrop` toggles (falls back to gradient)
5. **Style notes** — user `style_prompt` appended verbatim (optional)
6. **Negative constraints** — explicit "no bloom, glow, grain, added geometry" list
7. **Geometry lock (close)** — single-sentence reinforcement at the last tokens

**API call:** `duration: "3"` is always sent explicitly. Kling's default is 5 seconds; omitting it caused the model to stretch 3 seconds of motion into 5, distorting timing and inducing geometric drift.

Style overrides submitted at approval time (`POST /jobs/{id}/approve`) replace the original job-creation values, so the user can adjust materials and lighting while reviewing the base video.

---

## Why This Works

| Problem | Solution |
|---------|----------|
| AI invents geometry it cannot see | 72 pyrender frames at exact explosion positions anchor Kling to precise geometry |
| Wrong viewing angle for consumer POV | User confirms orientation in a 16:9 preview that matches the final video frustum |
| Camera path is inconsistent | Rodrigues rotation applies user roll to camera up-vector exactly |
| Model exported sideways | Longest-axis reorientation applied to both preview and pipeline; always Y-up |
| Style edits locked in too early | Style panel stays active during base video review; overrides sent at approval time |
| Kling drifts on geometry | Short imperative prompt leads with "SURFACE RESTYLE ONLY"; geometry-lock at first and last tokens |
| Kling stretches motion timing | `duration: "3"` sent explicitly — without it Kling defaults to 5s and distorts the orbit |
| AI costs spent before user is happy | Base video review gate before Phase 4 — FAL credits only consumed after approval |
| Demo shows wrong styled/unstyled label | `ai_styled` flag set from whether `final_video.mp4` exists, propagated to UI via job status |

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| STEP loading | [cascadio](https://github.com/OpenCASCADE/cascadio) (OpenCASCADE) | STEP → GLB conversion preserving assembly structure |
| Geometry | [Trimesh](https://trimesh.org/) | Assembly analysis, explosion vectors, reorientation |
| Rendering | [pyrender](https://pyrender.readthedocs.io/) | Headless OpenGL PNG export — 72 frames at 1920×1080 |
| Video assembly | ffmpeg | 72 PNG frames → 3-second 24fps mp4 |
| Backend | Python 3.11 + FastAPI | Pipeline orchestration, async job queue, file serving |
| AI Stylization | Kling o1 via [fal.ai](https://fal.ai) | Video-to-video edit: PBR materials, studio lighting |
| Frontend | React + TypeScript + Vite | Web UI: upload, orientation picker, style panel, video review |

---

## Quickstart

```bash
git clone https://github.com/kpuchkov1-code/Explodify.git
cd Explodify

# Backend
pip install -r requirements.txt
cp .env.example .env        # add FAL_KEY for Phase 4
PYTHONPATH=. uvicorn backend.main:app --port 8000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
# Open http://localhost:5173
```

### API-only usage

```bash
# Upload file and get orientation previews
curl -X POST http://localhost:8000/preview \
  -F "file=@assembly.obj" | python3 -c "
import sys, json, base64
d = json.load(sys.stdin)
print('preview_id:', d['preview_id'])
for face, uri in d['images'].items():
    open(f'preview_{face}.png', 'wb').write(base64.b64decode(uri.split(',')[1]))
print('Saved 6 face PNGs')
"

# Create a job
curl -X POST http://localhost:8000/jobs \
  -F "preview_id=<preview_id>" \
  -F "master_angle=front" \
  -F "explode_scalar=1.5" \
  -F "orbit_range_deg=40" \
  -F "studio_lighting=true"

# Poll status
curl http://localhost:8000/jobs/<job_id>

# Approve Phase 4 when status is awaiting_approval
curl -X POST http://localhost:8000/jobs/<job_id>/approve \
  -F "material_prompt=brushed aluminium body, matte black cap"

# Download final video
curl -o output.mp4 http://localhost:8000/jobs/<job_id>/video
```

### CLI (phases 1 & 2 only)

```bash
python explodify.py --input your_assembly.step --explode 1.5
```

Output frames are written to `output/frames/` by default.

---

## Environment Variables

```env
FAL_KEY=...    # fal.ai API key — required for Phase 4 (Kling AI styling)
               # Get one at https://fal.ai — hackathon voucher: techeurope-london
```

Copy `.env.example` to `.env`. Phases 1–3 run without any API keys.

---

## Roadmap

### v0.1 — Hackathon MVP (shipped)

- [x] Phase 1: Trimesh geometric analysis (explosion vectors)
- [x] Phase 1: STEP loading via cascadio (preserves named assembly components)
- [x] Phase 1: Automatic upright reorientation (longest-axis alignment)
- [x] Phase 2: pyrender — 72 frames at 1920×1080 with continuous orbit
- [x] Phase 2: MTL material color extraction (OBJ/MTL diffuse → pyrender material)
- [x] Phase 2: View-plane footprint camera (correct zoom for any aspect ratio)
- [x] Phase 2: Camera roll correction via Rodrigues rotation
- [x] Phase 3: ffmpeg assembly — 72 frames → 3-second 24fps mp4
- [x] Phase 4: Kling o1 via fal.ai — video-to-video style edit
- [x] Phase 4: Structured prompt with geometry-lock bookending
- [x] Phase 4: Style overrides accepted at approval time (not locked in at job creation)
- [x] Orientation preview: 6-face orthographic screenshots in 16:9 (matches video frustum)
- [x] Web UI: upload, orientation picker, style panel, base video review gate, video output
- [x] Demo mode: pre-rendered sample videos, no pipeline required
- [x] Demo mode: style panel pre-populated with demo material/lighting defaults
- [x] Demo mode: correctly reports `ai_styled` from whether styled video exists
- [x] Phase 4: `duration: "3"` passed to Kling — prevents 5s stretch distortion
- [x] Phase 4: concise geometry-first prompt (~700 chars); shorter prompts reduce drift
- [x] FastAPI backend: full async pipeline with job status polling

### v0.2 — Production

- [ ] Per-component material assignment (metal vs. plastic detection)
- [ ] Brand overlay (logo, color grading) post-processing pass
- [ ] Batch processing for product catalogues
- [ ] User accounts + job history
- [ ] Webhook delivery of finished mp4
- [ ] API for headless integration (CI/CD for product teams)

---

## Project Structure

```
Explodify/
├── explodify.py                   # CLI entry point (phases 1 & 2)
├── requirements.txt
├── README.md
├── .env.example                   # API key template
├── pipeline/
│   ├── models.py                  # Shared dataclasses: NamedMesh, FrameSet, PipelineMetadata
│   ├── format_loader.py           # Multi-format loader (STEP via cascadio, GLB/OBJ/STL via trimesh)
│   ├── phase1_geometry.py         # Trimesh: reorient, explosion vectors
│   ├── phase2_snapshots.py        # pyrender: 72 video frames + 5 keyframe PNGs
│   ├── phase3_assemble.py         # ffmpeg: frames → base_video.mp4
│   ├── phase4_video.py            # Kling o1 via fal.ai: video-to-video style edit
│   ├── prompt_interpreter.py      # Structured Kling prompt builder (geometry-lock + style)
│   └── orientation_preview.py    # 6-face orthographic preview renderer (/preview endpoint)
├── backend/
│   ├── main.py                    # FastAPI app: all endpoints + pipeline orchestration
│   ├── jobs.py                    # In-memory job store + approval event system
│   └── models.py                  # Pydantic models: JobStatus, PhaseStatus
├── frontend/
│   ├── src/
│   │   ├── App.tsx                # Main app state machine + layout
│   │   ├── api/client.ts          # API client: all fetch wrappers
│   │   ├── components/
│   │   │   ├── UploadZone.tsx     # Drag-and-drop file upload
│   │   │   ├── OrientationPicker.tsx  # 6-face cube selector
│   │   │   ├── StylePanel.tsx     # Material + lighting controls
│   │   │   ├── LoadingOutput.tsx  # Pipeline loader + AI styling loader
│   │   │   ├── VideoOutput.tsx    # Final video player
│   │   │   └── IdleOutput.tsx     # Empty state
│   │   └── index.css              # Full dark design system (Bebas Neue, IBM Plex Mono)
│   └── vite.config.ts             # Vite + proxy to :8000
├── tests/
│   ├── backend/test_api.py
│   └── pipeline/
│       ├── conftest.py
│       ├── test_format_loader.py
│       ├── test_phase1_geometry.py
│       ├── test_phase2_snapshots.py
│       ├── test_orientation_preview.py
│       └── test_integration_phase1_2.py
├── scripts/
│   └── rerender_demo.py           # Re-bake samples/final_video.mp4 via Kling (run when prompt changes)
└── samples/                       # Pre-rendered demo videos (not in git — generate via e2e or rerender_demo.py)
    ├── base_video.mp4
    └── final_video.mp4
```

---

## Partner Technologies

| Partner | Usage | Hackathon Prize Track |
|---------|-------|----------------------|
| **fal.ai** | Phase 4 Kling o1 video-to-video style edit | Best use of fal ($1000 USD credits) |

Hackathon voucher code for fal.ai: `techeurope-london`

---

## Hackathon

**Event:** Tech: Europe London AI Hackathon | April 2026  
**Track:** Open Innovation + Best Use of fal.ai side challenge  
**Submission:** 2-minute Loom demo + this public repo

---

## License

MIT
