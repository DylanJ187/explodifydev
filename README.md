# Explodify

Turn your CAD files into full-blown cinematic commercials in minutes.

Explodify takes a 3D CAD model (STEP, IGES, STL, OBJ, GLB, 3MF, …), disassembles it into its components, renders an orbiting exploded-view animation with pyrender, then optionally hands the clip off to Kling AI for a photoreal video-to-video restyle.

---

## Stack

**Frontend** — React 19 · TypeScript · Vite · React Router 7 · Framer Motion · Three.js / React Three Fiber · Supabase Auth
**Backend** — FastAPI · SQLite · pyrender · trimesh · ffmpeg
**AI** — fal.ai Kling v2.1 (video-to-video) · Kling o1 image edit (styling)

---

## Repo layout

```
Explodify/
├── backend/               FastAPI service + stores
│   ├── main.py            HTTP API (see "Endpoints" below)
│   ├── jobs.py            In-memory job registry + phase dispatcher
│   ├── gallery.py         SQLite-backed saved-video store (per-user)
│   ├── profiles.py        User profile + plan/credits store
│   ├── media_utils.py     ffmpeg wrappers (concat, thumbnail, duration)
│   └── models.py          Pydantic schemas
│
├── pipeline/              The 4-stage render pipeline
│   ├── phase1_geometry.py   Load + segment CAD → per-part meshes
│   ├── phase2_snapshots.py  pyrender frames at N timesteps per axis
│   ├── phase3_assemble.py   ffmpeg-encode frames → base MP4
│   ├── phase4_video.py      Optional: Kling video-to-video styling
│   ├── orientation_preview.py   Interactive orientation picker
│   ├── prompt_interpreter.py    Style-prompt → shading params
│   └── format_loader.py     Multi-format CAD loader
│
├── frontend/              Vite + React 19 SPA
│   └── src/
│       ├── App.tsx                Studio shell + state machine
│       ├── pages/
│       │   ├── LandingPage.tsx    Marketing landing (public)
│       │   ├── LoginPage.tsx      Supabase auth
│       │   └── AuthCallback.tsx
│       ├── components/
│       │   ├── landing/           Hero morph, DemoReel, backdrop
│       │   ├── Gallery.tsx        Saved videos, filters, stitch, bulk
│       │   ├── Profile.tsx        Plan, credits, upgrade packs
│       │   ├── StylePanel.tsx     Per-part material + global prompt
│       │   ├── EasingEditor.tsx   Curve editor for explosion / orbit
│       │   ├── MeshViewer.tsx     R3F orientation picker
│       │   ├── CustomVideoPlayer.tsx   Portal video chrome
│       │   ├── JobQueueIndicator.tsx   Draggable render-queue HUD
│       │   └── …
│       ├── contexts/JobQueueContext.tsx
│       ├── api/client.ts          Typed fetch wrappers
│       ├── routes/                Auth + tab routing
│       └── index.css              Design system (6 k+ lines)
│
└── tests/                 Pytest suite
```

---

## How a render flows

```
Upload CAD ─▶ Orientation ─▶ Style panel ─▶ Generate
                                              │
                                              ▼
                 ┌──────── Phase 1 ────────┐  ┌──── Phase 2 ────┐
                 │ load + segment parts    │  │ pyrender frames  │
                 └─────────────────────────┘  └──────────────────┘
                                              │
                                              ▼
                                    ┌──── Phase 3 ────┐
                                    │ ffmpeg → MP4     │  ← base video
                                    └──────────────────┘
                                              │
                                    Approve unstyled?
                                              │
                                              ▼ (opt-in)
                                    ┌──── Phase 4 ────┐
                                    │ Kling v2v style  │  ← styled video
                                    └──────────────────┘
                                              │
                                              ▼
                                    Save to Gallery
```

Each phase reports progress through `/jobs/{id}` so the `JobQueueIndicator`
and `LoadingOutput` stay in sync.

---

## API surface

All routes are hosted at `http://localhost:8000` by default.

### Studio
| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/preview` | Upload CAD, return preview images + part names |
| `POST` | `/preview/frame` | Render a single orientation frame |
| `GET`  | `/preview/{preview_id}/mesh.glb` | Streamed mesh for R3F viewer |
| `POST` | `/jobs` | Create a render job (all settings baked in) |
| `GET`  | `/jobs/{id}` | Poll phase/progress/outputs |
| `POST` | `/jobs/{id}/approve` | Approve unstyled → trigger Phase 4 |
| `POST` | `/jobs/{id}/restyle` | New styling pass on an existing render |
| `GET`  | `/jobs/{id}/base_video/{variant}` | Unstyled MP4 |
| `GET`  | `/jobs/{id}/video/{variant}` | Styled MP4 |
| `GET`  | `/jobs/{id}/loop_video/{variant}` | 6-second seamless loop |

### Gallery
| Method | Path | Purpose |
| --- | --- | --- |
| `GET`  | `/gallery` | List saved clips |
| `GET`  | `/gallery/stats` | Tier + used/cap slots |
| `POST` | `/gallery` | Save a render to gallery |
| `POST` | `/gallery/replace` | Capacity-gated replace |
| `POST` | `/gallery/{id}/favorite` | Toggle favorite |
| `POST` | `/gallery/{id}/rename` | Rename title |
| `DELETE` | `/gallery/{id}` | Delete clip |
| `GET`  | `/gallery/{id}/video` | Download / stream |
| `GET`  | `/gallery/{id}/thumbnail` | Still frame |
| `POST` | `/stitch` | Concatenate multiple clips |

### Account
| Method | Path | Purpose |
| --- | --- | --- |
| `GET`  | `/account/me` | Plan, credits, display name, avatar |
| `POST` | `/account` | Update profile prefs |
| `POST` | `/account/signout-all` | Invalidate all sessions |

---

## Running locally

### Backend
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install fastapi uvicorn python-dotenv pyrender trimesh numpy pydantic pillow "python-multipart" fal-client
uvicorn backend.main:app --reload --port 8000
```

Environment variables (`.env` at repo root):
```
FAL_KEY=<your fal.ai key>           # required for Phase 4 styling
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
```

### Frontend
```bash
cd frontend
npm install
npm run dev     # → http://localhost:5173
```

Frontend env (`frontend/.env.local`):
```
VITE_API_BASE=http://localhost:8000
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

---

## Credits & plans

| Plan | Price | Credits / month | Premium renders | HQ renders | Standard renders |
| --- | --- | --- | --- | --- | --- |
| Free | £0 | 30 | 1 | 2 | 6 |
| Pro | £29.99 | 450 | 15 | 30 | 90 |
| Studio | £49.99 | 900 | 30 | 60 | 180 |
| Top-up pack | £14.99 (one-time) | 150 | 5 | 10 | 30 |

Cost model: 1 Premium = 30 credits = 2 HQ = 6 Standard.

---

## Key UX details

- **Landing hero** — CAD morphs letter-by-letter into CINEMATIC AD with per-letter gold wipe; "goes in…" and "comes out." sidekicks animate between states. Main row shifts up, subtitle/CTA stay locked.
- **Studio state machine** — `idle → uploading → orientation → processing → awaiting_approval → styling → done`. Each transition is a single state change in `App.tsx`.
- **Review gate** — unstyled video is reviewable before any AI credits are spent. Save-to-gallery, Style, Adjust, Start Over all sit inline.
- **Job queue HUD** — floating pill bottom-right by default; drag it to any corner and it snaps + persists via `localStorage`.
- **Gallery** — filters by library (All/Recent/Favorites) and type (Unstyled/Styled/Loop/Stitched). Multi-select with bulk delete + bulk stitch. Keyboard: `Esc` clear, `Cmd/Ctrl+A` select-all filtered, `Del`/`Backspace` bulk delete, `G`/`L` grid/list.

---

## Design system

- **Typography** — Bebas Neue (display), IBM Plex Sans (body), IBM Plex Mono (meta/eyebrow).
- **Palette** — Deep panel blacks, `--accent: #d4a843` amber gradient, teal/slate support accents for tier cards.
- **Motifs** — CAD-style corner brackets, dashed hairlines, outlined numerals. No purple/violet hues anywhere.

---

## Testing

```bash
pytest tests/ -v
```

Coverage focus: pipeline phase correctness, gallery store invariants, orientation math.

---

## License

Proprietary — all rights reserved.
