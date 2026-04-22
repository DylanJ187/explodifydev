# Explodify

Explodify is a CAD-to-cinematic-video pipeline. Upload a CAD file (`.step`, `.iges`, `.stl`, `.obj`, `.glb`, `.3mf`), pick an explosion axis and animation profile, and receive a polished MP4 of the model exploding apart — rendered with pyrender and optionally restyled with FAL.ai Kling.

---

## Tech Stack

| Layer | Technology |
| --- | --- |
| Backend | FastAPI (Python) |
| Frontend | React 19 + TypeScript (Vite) |
| Routing | React Router 7 |
| Auth | Supabase |
| Motion | Framer Motion |
| 3D preview | Vanilla Three.js (`createViewer.ts`) — NOT @react-three/fiber |
| 3D rendering | pyrender + trimesh |
| Video assembly | ffmpeg |
| AI styling | FAL.ai video-to-video (Kling o1 + LTX-2.3) |
| Job store | In-memory (`backend/jobs.py`) |
| Gallery store | SQLite (per-user) |

**Important:** The 3D orientation viewer uses vanilla Three.js, NOT @react-three/fiber. R3F was abandoned due to React 19 StrictMode + R3F v9 compatibility issues (double-mount destroying WebGL context). Do not add R3F or drei as dependencies.

---

## Repo Layout

```
Explodify/
├── backend/               FastAPI service + stores
│   ├── main.py            HTTP API, pipeline orchestrator, _FAL_ENABLED flag
│   ├── jobs.py            In-memory job registry + phase dispatcher
│   ├── gallery.py         SQLite-backed saved-video store (per-user)
│   ├── profiles.py        Plan + credits store
│   ├── media_utils.py     ffmpeg wrappers (concat, thumbnail, duration)
│   └── models.py          Pydantic schemas
│
├── pipeline/              Four-stage render pipeline
│   ├── phase1_geometry.py     Load + segment CAD, reorient(), axis_directions()
│   ├── phase2_snapshots.py    pyrender frames per axis with orbit camera
│   ├── phase3_assemble.py     ffmpeg encode frames → MP4
│   ├── phase4_video.py        Optional FAL v2v styling (Kling o1 / LTX-2.3)
│   ├── orientation_preview.py 6-face preview images for upload step
│   ├── prompt_interpreter.py  Style prompt → shading params
│   └── format_loader.py       Multi-format CAD loader
│
├── frontend/              Vite + React 19 SPA
│   └── src/
│       ├── App.tsx              Studio shell + state machine
│       ├── pages/               Landing, Login, AuthCallback
│       ├── components/          Studio, shell, landing, gallery
│       ├── contexts/            JobQueueContext
│       ├── api/client.ts        Typed fetch wrappers
│       └── index.css            Design system tokens + component styles
│
└── tests/                 Pytest suite
```

---

## Pipeline Phases

1. **Phase 1 — Geometry Analysis** (`phase1_geometry.py`): Parse mesh, apply `reorient()` (aligns longest bounding-box axis to world Y), compute component bounding boxes, derive explosion vectors. Returns `axis_directions()`.
2. **Phase 2 — Snapshot Rendering** (`phase2_snapshots.py`): pyrender renders 72 PNG frames per variant with turntable orbit camera around world Y.
3. **Phase 3 — ffmpeg Assembly** (`phase3_assemble.py`): Stitch frames into an MP4 (explode + reverse loop).
4. **Phase 4 — FAL Styling** (`phase4_video.py`): Submit the rendered MP4 to FAL.ai. Premium tier routes to Kling o1 v2v edit; Standard tier routes to LTX-2.3 distilled reference-v2v. Gated by user approval and the `_FAL_ENABLED` flag in `main.py`.

---

## Render Flow

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
                                    │   FAL v2v style  │  ← styled video
                                    └──────────────────┘
                                              │
                                              ▼
                                    Save to Gallery
```

Each phase reports progress through `/jobs/{id}`; the `JobQueueIndicator` HUD and `LoadingOutput` stay in sync.

---

## Current State

- End-to-end pipeline is working.
- **Approval gate always runs**: `auto_approve` is permanently `False`. After Phase 3, the job pauses at `status: awaiting_approval` and the frontend renders `DualApprovalGate` with the base MP4.
- **Triple-axis explosion**: X, Y, Z variants rendered. `selected_variant` controls which one(s) run; `VARIANT_NAMES = ("x", "y", "z")`.
- **Explosion Profile (POSITION RAMP)**: EasingEditor with 5 draggable samples at t=[0, 0.25, 0.5, 0.75, 1.0]. Samples are absolute % exploded (0–100%), NOT velocity. Backend interpolates via Catmull-Rom (`interpolate_position_profile()`). Default: Cinematic `[0, 0.08, 0.5, 0.92, 1.0]`.
- **Camera orbit arc**: Cyan arc with arrowhead. Slider 0–360°; 360° closes into a full circle. Radius = `modelDiagonal * 0.75`. Modes: X (horizontal turntable), Y (vertical crane around frozen `verticalAnchorDir`), Swap (reverses `orbit_direction`).
- **Orbit-specific easing**: Independent 5-sample position curve for orbit. Same semantics as explosion.
- **Live preview frame**: `PreviewFrame` component renders a single pyrender frame at t=0 from the current camera direction (debounced 280 ms).
- **Free-tier watermark**: `canDownload=false` users see an `EXPLODIFY` overlay and a "Upgrade to download" button that opens the shared `PricingModal`.
- **Model tier selector** on the review gate: Standard (LTX-2.3 Distilled) and Premium (Kling o1). Horizontal popover anchored right of the trigger.
- **FAL kill switch**: set `_FAL_ENABLED = False` near the top of `backend/main.py` to skip the v2v pass and return only base renders.

---

## UI Architecture

### Navigation (`TopNav.tsx`)
Three-tab nav (Studio / Gallery / Profile) with a sliding amber indicator (CSS `--tab-i` variable drives a single `top-nav-slider` element, 240ms cubic-bezier). Credit chip on the right shows `{n} cr`, turns amber below 30% balance, click navigates to Profile.

### Gallery (`Gallery.tsx`)
`PreviewModal` uses `<CustomVideoPlayer>`. Filters by library (All / Recent / Favorites) and type (Unstyled / Styled / Loop / Stitched). Multi-select with bulk delete + bulk stitch. Keyboard: `Esc` clear, `Cmd/Ctrl+A` select-all filtered, `Del` / `Backspace` bulk delete, `G` / `L` grid / list.

### Profile (`Profile.tsx`) — decluttered
Single-viewport layout. Identity row → Usage card (credits, progress bar, render budget grid) → Model tier reference (`<details>` disclosure) → Footer. "Upgrade plan" and "Buy credit pack" both open `PricingModal`.

### PricingModal (`shell/PricingModal.tsx`)
Portal modal above TopNav (z-index 900). ESC / backdrop dismiss. Four cards: Starter + Standard (one-time) and Pro + Studio (monthly). Starter and Standard expose a "Permanently removes watermarks" bullet; Pro and Studio imply it. Invoked from Profile, the Studio video player's upgrade button, and the Gallery preview upgrade button.

### Model selector (`ModelSelector.tsx` + `ModelSelectionPopover.tsx`)
Compact horizontal popover, portal-rendered with `position: fixed`, anchored to the right of the trigger via `getBoundingClientRect()`. Two pills: Standard (LTX-2.3 Distilled) / Premium (Kling o1). No icons except the credit glyph.

---

## Pricing

Canonical pricing lives in `explodify/pricing-model.md` (Obsidian vault). Prices are set explicitly per currency in Stripe — no runtime FX. Customer currency is detected from `CF-IPCountry` and overridable via a footer picker.

| Plan | USD | EUR | GBP | CAD | AUD | JPY | Credits | Premium / Std |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Free | — | — | — | — | — | — | 30 (watermarked) | 1 / 6 |
| Starter (one-time) | $9.99 | €9.99 | £6.99 | C$12.99 | A$14.99 | ¥1,490 | 60 | 2 / 12 |
| Standard (one-time) | $19.99 | €19.99 | £14.99 | C$24.99 | A$29.99 | ¥2,990 | 150 | 5 / 30 |
| Pro (/mo) | $29.99 | €29.99 | £29.99 | C$39.99 | A$44.99 | ¥4,490 | 450 | 15 / 90 |
| Studio (/mo) | $49.99 | €49.99 | £49.99 | C$64.99 | A$74.99 | ¥7,490 | 900 | 30 / 180 |

Cost model: 1 Premium = 30 credits = 6 Standard. Any paid SKU permanently removes the watermark on first purchase (durable across subscription cancellation).

---

## Running Locally

**Backend:**
```bash
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"              # installs from pyproject.toml
uvicorn backend.main:app --reload --port 8000
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev          # → http://localhost:5173
```

**Root `.env` (gitignored — required):**
```
FAL_KEY=<your fal.ai key>
SUPABASE_URL=https://<project-ref>.supabase.co
# SUPABASE_JWT_AUD=authenticated   # optional; defaults to "authenticated"
# SUPABASE_JWT_ALGS=RS256,ES256    # optional; HS256 is hard-rejected at import
```

The backend fails fast on import if `SUPABASE_URL` is missing or not https. See `.env.example` for the full list.

**`frontend/.env.local` (gitignored — required):**
```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<legacy JWT anon key, safe to embed>
```

The frontend throws on startup if either value is missing or still a placeholder.

To disable FAL styling (keep base render only): set `_FAL_ENABLED = False` near the top of `backend/main.py` and restart.

---

## API Shape

### Studio
| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/preview` | Upload CAD, return preview images + part names |
| `POST` | `/preview/frame` | Render a single orientation frame |
| `GET`  | `/preview/{preview_id}/mesh.glb` | Streamed mesh for the Three.js viewer |
| `POST` | `/jobs` | Create a render job |
| `GET`  | `/jobs/{id}` | Poll phase / progress / outputs |
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
| `POST` | `/gallery` | Save a render |
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

Every route above except `GET /health` is guarded by `Depends(current_user)`. Requests without a valid Supabase `Authorization: Bearer <jwt>` header return `401`. See [Authentication](#authentication) for the verification path.

### `POST /jobs` — key form fields

- `selected_variant` — `"x"`, `"y"`, `"z"`, or comma-separated subset
- `camera_direction` — JSON `[x, y, z]` unit vector from model center toward camera (reoriented space)
- `easing_curve` — JSON of 5 floats (sampled position ramp) or 4 floats (legacy CSS cubic-bezier)
- `orbit_mode` — `"horizontal"` or `"vertical"`
- `orbit_direction` — `1` or `-1`
- `orbit_easing` — JSON 5-sample orbit position ramp
- `explode_scalar`, `orbit_range_deg`, `camera_zoom`, `component_rows`, `style_prompt`

---

## Coordinate Convention

Three.js `normalize(camera.position - controls.target)` = direction from model center toward camera.

Backend `cam_dir` in `phase2_snapshots.py` uses the same convention. Both operate in reoriented space (after `reorient()` aligns the longest axis to world Y). No transformation needed between frontend and backend.

---

## Key Reference Files

| File | Purpose |
| --- | --- |
| `backend/main.py` | FastAPI app, pipeline orchestrator, `_FAL_ENABLED` flag |
| `pipeline/phase1_geometry.py` | Geometry analysis, `reorient()`, `axis_directions()` |
| `pipeline/phase2_snapshots.py` | pyrender frame generation, orbit around world Y |
| `pipeline/phase3_assemble.py` | ffmpeg video assembly |
| `pipeline/phase4_video.py` | FAL.ai v2v styling (Kling o1 + LTX-2.3) |
| `frontend/src/App.tsx` | React state machine |
| `frontend/src/api/client.ts` | Typed API client |
| `frontend/src/components/TopNav.tsx` | 3-tab nav with sliding indicator + credit chip |
| `frontend/src/components/Gallery.tsx` | Gallery grid, filters, stitch, PreviewModal |
| `frontend/src/components/Profile.tsx` | Usage card + PricingModal trigger |
| `frontend/src/components/shell/PricingModal.tsx` | Shared 4-card pricing modal |
| `frontend/src/components/CustomVideoPlayer.tsx` | Player chrome, watermark, upgrade CTA |
| `frontend/src/components/ModelSelector.tsx` | Tier button (LTX-2.3 / Kling o1) |
| `frontend/src/components/ModelSelectionPopover.tsx` | Portal-anchored popover beside the tier button |
| `frontend/src/components/orientation/createViewer.ts` | Vanilla Three.js engine |

---

## Tuning Constants

- `phase1_geometry.py` — `boost = 1.25` (explosion spread multiplier)
- `phase2_snapshots.py` — 72 frames per axis per direction
- `index.css` — `--accent: #d4a843`, `--panel-l`, `--border` (design tokens)

---

## Architecture Notes

- `MeshViewer` owns the format decision: Three.js for GLB/OBJ, static pyrender image for everything else.
- `DualApprovalGate` renders `/jobs/{id}/base_video/{variant}` as a looping video. Three actions in order: "Style This Video" → "← Adjust Explosion" → "↺ Start Over". Adjust calls `setState('orientation')` without resetting state.
- `@mlightcad/three-viewcube` installed with `--legacy-peer-deps`.
- TrackballControls snap-back bug fixed: after ViewCube face snap, `camera.up` is set from the face quaternion and internal state zeroed before re-enabling controls.
- macOS constraint: pyrender requires the main thread. Phase 2 cannot be parallelised via threads or subprocesses.

---

## Design System

- **Typography** — Bebas Neue (display), IBM Plex Sans (body), IBM Plex Mono (meta / eyebrow).
- **Palette** — Deep panel blacks, `--accent: #d4a843` amber, teal / slate support accents for tier cards.
- **Motifs** — CAD-style corner brackets, dashed hairlines, outlined numerals.

---

## Authentication

- **Identity provider:** Supabase. ES256 / RS256 asymmetric JWTs, verified against the project JWKS at `/auth/v1/.well-known/jwks.json`.
- **Backend:** `backend/auth.py` exposes `current_user` as a FastAPI dependency. Every non-`/health` route lives on `APIRouter(dependencies=[Depends(current_user)])` — there is exactly one audit boundary and no way to forget the guard.
- **JWKS caching:** single-entry `lru_cache` on `jwks()`. On an unknown `kid` we clear the cache once and refetch, so Supabase key rotations don't require a backend restart.
- **HS256 is rejected at import time.** Operators cannot weaken signature verification via `SUPABASE_JWT_ALGS`.
- **`SUPABASE_URL` is required and must be HTTPS** — the module raises on import if either check fails.
- **Frontend:** `src/api/authFetch.ts` attaches the Supabase access token and runs a single-flight refresh on `401`. A rejected refresh signs the user out and redirects to `/login`. All API calls in `client.ts` and `MeshViewer.tsx` go through this wrapper.

See `docs/adr/001-auth-jwks.md` for the decision rationale.

---

## Testing

```bash
# Backend
pip install -e ".[dev]"
pytest -q                             # unit + auth + api tests
```

```bash
# Frontend
cd frontend
npm install
npm run test                          # vitest run
npm run test:watch                    # vitest watch
```

CI runs both suites on every push / PR via `.github/workflows/ci.yml`.

Coverage focus: pipeline phase correctness, gallery store invariants, orientation math, JWKS verification edge cases, and the `authFetch` single-flight refresh path.

---

## Coding Style Rules

- No purple or violet hues in any frontend UI.
- No `console.log` statements committed.
- No emojis in code, comments, commit messages, or docs.
- Immutable patterns: always return new objects, never mutate in place.
- Functions under 50 lines, files under 800 lines.
- No hardcoded secrets — use `.env`.

---

## License

Proprietary — all rights reserved.
