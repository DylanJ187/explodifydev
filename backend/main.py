# backend/main.py
import asyncio
import os
import tempfile
import uuid
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response

import backend.jobs as jobs
from backend.gallery import GalleryStore
from backend.media_utils import concat_videos, extract_thumbnail, probe_duration
from backend.models import JobStatus

_PROJECT_ROOT = Path(__file__).parent.parent
load_dotenv(_PROJECT_ROOT / ".env")

# Set to True to re-enable Kling AI styling (Phase 4).
# Keep False during development to avoid unexpected charges and to allow
# the base render approval gate to function correctly.
_FAL_ENABLED = True

app = FastAPI(title="Explodify API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://localhost:5174"],
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = Path(tempfile.gettempdir()) / "explodify_uploads"
PREVIEW_DIR = Path(tempfile.gettempdir()) / "explodify_previews"
GALLERY_DIR = Path(tempfile.gettempdir()) / "explodify_gallery"
STITCH_DIR = GALLERY_DIR / "stitched"
THUMB_DIR = GALLERY_DIR / "thumbnails"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
GALLERY_DIR.mkdir(parents=True, exist_ok=True)
STITCH_DIR.mkdir(parents=True, exist_ok=True)
THUMB_DIR.mkdir(parents=True, exist_ok=True)

gallery_store = GalleryStore(GALLERY_DIR / "gallery.db")

VARIANT_NAMES = ("x", "y", "z")


def _register_gallery_video(
    *,
    video_path: Path,
    kind: str,
    title: str,
    job_id: str | None = None,
    variant: str | None = None,
    metadata: dict | None = None,
) -> dict | None:
    """Add a completed video to the gallery, generating a thumbnail best-effort.

    Never raises — gallery registration is a nice-to-have side effect of job
    completion, and must not break the pipeline.
    """
    try:
        if not Path(video_path).exists():
            return None
        thumb_name = f"{uuid.uuid4().hex}.jpg"
        thumb_out = THUMB_DIR / thumb_name
        thumb = extract_thumbnail(Path(video_path), thumb_out)
        duration = probe_duration(Path(video_path))
        return gallery_store.add_item(
            kind=kind,
            title=title,
            video_path=Path(video_path),
            thumbnail_path=thumb,
            duration_s=duration,
            job_id=job_id,
            variant=variant,
            metadata=metadata or {},
        )
    except Exception as exc:  # noqa: BLE001 — best-effort logging
        import logging
        logging.warning("Gallery registration failed: %s", exc)
        return None


@app.get("/health")
def health():
    return {"status": "ok"}



@app.post("/preview")
async def preview_orientations(file: UploadFile = File(...)):
    preview_id = str(uuid.uuid4())
    suffix = Path(file.filename or "upload.obj").suffix.lower()
    preview_path = PREVIEW_DIR / f"{preview_id}{suffix}"

    content = await file.read()
    preview_path.write_bytes(content)

    try:
        from pipeline.format_loader import load_assembly
        from pipeline.orientation_preview import render_orientation_previews
        from pipeline.phase1_geometry import GeometryAnalyzer

        named_meshes = load_assembly(str(preview_path))
        analyzer = GeometryAnalyzer()
        named_meshes = analyzer.reorient(named_meshes)
        images = render_orientation_previews(named_meshes)
        explosion_axes = analyzer.axis_directions(named_meshes)

        # Export reoriented scene as GLB so the frontend viewer can load any
        # format (STL, ZIP, STEP, …) without doing its own reorientation.
        try:
            import trimesh as _trimesh
            glb_scene = _trimesh.Scene()
            for nm in named_meshes:
                glb_scene.add_geometry(nm.mesh, geom_name=nm.name)
            glb_bytes = glb_scene.export(file_type="glb")
            glb_path = PREVIEW_DIR / f"{preview_id}_viewer.glb"
            glb_path.write_bytes(glb_bytes)
        except Exception as _glb_exc:
            import logging as _logging
            _logging.warning("GLB viewer mesh export failed: %s", _glb_exc)

    except Exception as exc:
        preview_path.unlink(missing_ok=True)
        raise HTTPException(status_code=422, detail=str(exc))

    component_names = [nm.name for nm in named_meshes]
    return {
        "preview_id": preview_id,
        "images": images,
        "component_names": component_names,
        "explosion_axes": explosion_axes,
    }


@app.post("/preview/frame")
async def get_preview_frame_endpoint(
    preview_id: str = Form(...),
    camera_direction: Optional[str] = Form(None),
):
    """Render a single frame (t=0, no explosion) for the live preview box.

    Returns a PNG image from the current camera direction. Used by the
    frontend PreviewFrame component to show a live first-frame preview
    as the user adjusts camera angle.
    """
    matches = list(PREVIEW_DIR.glob(f"{preview_id}.*"))
    if not matches:
        raise HTTPException(status_code=404, detail="Preview not found -- re-upload the file.")

    # Prefer the source file (non-GLB) for full geometry fidelity.
    # The viewer GLB is excluded since it is reoriented; use the non-viewer
    # non-GLB source when available.
    source_file = next(
        (m for m in matches if not m.name.endswith("_viewer.glb")),
        matches[0],
    )

    cam_dir_vec: list[float] | None = None
    if camera_direction:
        import json as _json
        try:
            parsed = _json.loads(camera_direction)
            if isinstance(parsed, list) and len(parsed) == 3:
                cam_dir_vec = [float(v) for v in parsed]
        except Exception:
            pass

    try:
        from pipeline.format_loader import load_assembly
        from pipeline.phase1_geometry import GeometryAnalyzer
        from pipeline.phase2_snapshots import SnapshotRenderer
        import io
        import numpy as np

        named_meshes = load_assembly(str(source_file))
        analyzer = GeometryAnalyzer()
        named_meshes = analyzer.reorient(named_meshes)
        meshes = [nm.mesh for nm in named_meshes]

        if cam_dir_vec is not None:
            arr = np.array(cam_dir_vec, dtype=np.float64)
            norm = float(np.linalg.norm(arr))
            cam_dir = arr / norm if norm > 1e-6 else np.array([0.3, 0.3, 1.0])
        else:
            cam_dir = np.array([0.3, 0.3, 1.0])

        renderer = SnapshotRenderer()
        img = renderer._render_scene(
            meshes, cam_dir,
            orbit_deg=0.0,
            up_rotation_deg=0.0,
            resolution=(480, 270),
        )
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return Response(content=buf.getvalue(), media_type="image/png")

    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Frame render failed: {exc}")


@app.get("/preview/{preview_id}/mesh.glb")
def get_preview_mesh(preview_id: str):
    glb_path = PREVIEW_DIR / f"{preview_id}_viewer.glb"
    if not glb_path.exists():
        raise HTTPException(status_code=404, detail="Viewer mesh not found")
    return FileResponse(str(glb_path), media_type="model/gltf-binary")


@app.post("/jobs", status_code=202)
async def create_job(
    file: Optional[UploadFile] = File(None),
    preview_id: Optional[str] = Form(None),
    explode_scalar: float = Form(1.5),
    style_prompt: str = Form(""),
    component_rows: str = Form("[]"),
    camera_direction: Optional[str] = Form(None),
    rotation_offset_deg: float = Form(0.0),
    orbit_range_deg: float = Form(40.0),
    camera_zoom: float = Form(1.0),
    variants_to_render: str = Form("x,y,z"),
    selected_variant: Optional[str] = Form(None),
    easing_curve: str = Form("[0.25,0.1,0.25,1.0]"),
    orbit_mode: str = Form("horizontal"),
    orbit_direction: int = Form(1),
    orbit_easing: Optional[str] = Form(None),
    loop_mode: str = Form("standard"),
):
    if preview_id:
        matches = list(PREVIEW_DIR.glob(f"{preview_id}.*"))
        if not matches:
            raise HTTPException(status_code=404, detail="Preview not found -- re-upload the file.")
        cad_path = matches[0]
    elif file is not None:
        suffix = Path(file.filename or "upload.obj").suffix.lower()
        cad_path = UPLOAD_DIR / f"{str(uuid.uuid4())}{suffix}"
        content = await file.read()
        cad_path.write_bytes(content)
    else:
        raise HTTPException(status_code=422, detail="Either file or preview_id is required.")

    job_id = jobs.create_job()

    # Determine which variants to render. Always pause for user approval after
    # phase 3 so the base render can be previewed before AI styling.
    if selected_variant and selected_variant in VARIANT_NAMES:
        parsed_variants = [selected_variant]
    else:
        parsed_variants = [
            v.strip() for v in variants_to_render.split(",")
            if v.strip() in VARIANT_NAMES
        ] or list(VARIANT_NAMES)
    auto_approve = False

    import json as _json
    try:
        parsed_rows: list[dict] = _json.loads(component_rows)
        if not isinstance(parsed_rows, list):
            parsed_rows = []
    except Exception:
        parsed_rows = []

    try:
        parsed_curve: list[float] = _json.loads(easing_curve)
        if not isinstance(parsed_curve, list) or len(parsed_curve) not in (4, 5):
            parsed_curve = None
    except Exception:
        parsed_curve = None

    cam_dir_vec: list[float] | None = None
    if camera_direction:
        try:
            parsed_cam_dir = _json.loads(camera_direction)
            if isinstance(parsed_cam_dir, list) and len(parsed_cam_dir) == 3:
                cam_dir_vec = [float(v) for v in parsed_cam_dir]
        except Exception:
            pass

    parsed_orbit_easing: list[float] | None = None
    if orbit_easing:
        try:
            oe = _json.loads(orbit_easing)
            if isinstance(oe, list) and len(oe) == 5:
                parsed_orbit_easing = [float(v) for v in oe]
        except Exception:
            pass

    parsed_orbit_mode = orbit_mode if orbit_mode in ("horizontal", "vertical") else "horizontal"
    parsed_orbit_direction = orbit_direction if orbit_direction in (1, -1) else 1

    asyncio.create_task(
        _run_pipeline(
            job_id, cad_path, explode_scalar,
            rows=parsed_rows,
            style_prompt=style_prompt,
            camera_direction=cam_dir_vec,
            rotation_offset_deg=rotation_offset_deg,
            orbit_range_deg=orbit_range_deg,
            camera_zoom=camera_zoom,
            variants_to_render=parsed_variants,
            auto_approve=auto_approve,
            easing_curve=parsed_curve,
            orbit_mode=parsed_orbit_mode,
            orbit_direction=parsed_orbit_direction,
            orbit_easing=parsed_orbit_easing,
        )
    )

    return {"job_id": job_id}


@app.get("/jobs/{job_id}", response_model=JobStatus)
def get_job(job_id: str):
    job = jobs.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    return job


@app.get("/jobs/{job_id}/frames/{frame_name}")
def get_frame(job_id: str, frame_name: str):
    allowed = {"frame_a", "frame_b", "frame_c", "frame_d", "frame_e"}
    if frame_name not in allowed:
        raise HTTPException(status_code=400, detail=f"Unknown frame: {frame_name}")
    job = jobs.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status not in ("running", "awaiting_approval", "done"):
        raise HTTPException(status_code=425, detail="Frames not ready yet")
    frame_path = UPLOAD_DIR / job_id / "raw" / f"{frame_name}.png"
    if not frame_path.exists():
        raise HTTPException(status_code=404, detail=f"{frame_name}.png not found")
    return FileResponse(str(frame_path), media_type="image/png")


@app.post("/jobs/{job_id}/approve", status_code=202)
async def approve_job(
    job_id: str,
    component_rows: Optional[str] = Form(None),
    style_prompt: Optional[str] = Form(None),
    selected_variants: Optional[str] = Form(None),
):
    job = jobs.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    if job.status != "awaiting_approval":
        raise HTTPException(
            status_code=409,
            detail=f"Job is not awaiting approval (status: {job.status})",
        )

    import json as _json
    style_overrides = None
    if component_rows is not None:
        try:
            parsed_override_rows: list[dict] = _json.loads(component_rows)
            if not isinstance(parsed_override_rows, list):
                parsed_override_rows = []
        except Exception:
            parsed_override_rows = []
        style_overrides = {
            "rows": parsed_override_rows,
            "style_prompt": style_prompt or "",
        }

    variants = None
    if selected_variants:
        variants = [v.strip() for v in selected_variants.split(",") if v.strip() in VARIANT_NAMES]

    signalled = jobs.approve_phase4(
        job_id, style_overrides=style_overrides, selected_variants=variants,
    )
    if not signalled:
        raise HTTPException(status_code=409, detail="Approval event already consumed")
    return {"ok": True}


@app.get("/jobs/{job_id}/base_video/{variant}")
def get_base_video_variant(job_id: str, variant: str):
    from backend.models import PhaseStatus
    if variant not in VARIANT_NAMES:
        raise HTTPException(status_code=400, detail=f"Unknown variant: {variant}")
    job = jobs.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.phases.get(3) != PhaseStatus.done:
        raise HTTPException(status_code=425, detail="Base video not ready yet")
    video_path = UPLOAD_DIR / job_id / f"base_video_{variant}.mp4"
    if not video_path.exists():
        raise HTTPException(status_code=404, detail=f"Base video ({variant}) not found")
    return FileResponse(str(video_path), media_type="video/mp4")


@app.get("/jobs/{job_id}/base_video")
def get_base_video(job_id: str):
    """Legacy endpoint -- serves the longest-axis variant."""
    return get_base_video_variant(job_id, "longest")


@app.get("/jobs/{job_id}/loop_video/{variant}")
def get_loop_video(job_id: str, variant: str):
    if variant not in VARIANT_NAMES:
        raise HTTPException(status_code=400, detail=f"Unknown variant: {variant}")
    job = jobs.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    # Prefer the styled loop if it exists; fall back to unstyled.
    styled_loop = UPLOAD_DIR / job_id / f"final_loop_video_{variant}.mp4"
    unstyled_loop = UPLOAD_DIR / job_id / f"loop_video_{variant}.mp4"
    path = styled_loop if styled_loop.exists() else unstyled_loop
    if not path.exists():
        raise HTTPException(status_code=404, detail="Loop video not ready")
    return FileResponse(str(path), media_type="video/mp4")


@app.get("/jobs/{job_id}/video/{variant}")
def get_video_variant(job_id: str, variant: str):
    if variant not in VARIANT_NAMES:
        raise HTTPException(status_code=400, detail=f"Unknown variant: {variant}")
    job = jobs.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status not in ("awaiting_approval", "done"):
        raise HTTPException(status_code=425, detail="Video not ready yet")
    video_path = UPLOAD_DIR / job_id / f"final_video_{variant}.mp4"
    if not video_path.exists():
        video_path = UPLOAD_DIR / job_id / f"base_video_{variant}.mp4"
    if not video_path.exists():
        raise HTTPException(status_code=404, detail="Video file not found")
    return FileResponse(str(video_path), media_type="video/mp4")


@app.get("/jobs/{job_id}/video")
def get_video(job_id: str):
    """Legacy endpoint -- serves longest-axis variant."""
    return get_video_variant(job_id, "longest")


# ────────────────────────────────────────────────────────────────────────────
# Gallery endpoints
# ────────────────────────────────────────────────────────────────────────────


@app.get("/gallery")
def list_gallery(kind: Optional[str] = None, limit: int = 200):
    allowed_kinds = {"base", "styled", "stitched", "loop"}
    kind_filter = kind if kind in allowed_kinds else None
    items = gallery_store.list_items(kind=kind_filter, limit=limit)  # type: ignore[arg-type]
    return {"items": items}


@app.get("/gallery/{item_id}")
def get_gallery_item(item_id: str):
    item = gallery_store.get_item(item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Gallery item not found")
    return item


@app.get("/gallery/{item_id}/video")
def get_gallery_video(item_id: str):
    item = gallery_store.get_item(item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Gallery item not found")
    path = Path(item["video_path"])
    if not path.exists():
        raise HTTPException(status_code=404, detail="Video file missing on disk")
    return FileResponse(str(path), media_type="video/mp4")


@app.get("/gallery/{item_id}/thumbnail")
def get_gallery_thumbnail(item_id: str):
    item = gallery_store.get_item(item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Gallery item not found")
    thumb = item.get("thumbnail_path")
    if not thumb or not Path(thumb).exists():
        raise HTTPException(status_code=404, detail="Thumbnail unavailable")
    return FileResponse(str(thumb), media_type="image/jpeg")


@app.post("/gallery/{item_id}/rename")
def rename_gallery_item(item_id: str, title: str = Form(...)):
    clean = (title or "").strip()[:120]
    if not clean:
        raise HTTPException(status_code=422, detail="Title cannot be empty")
    ok = gallery_store.update_title(item_id, clean)
    if not ok:
        raise HTTPException(status_code=404, detail="Gallery item not found")
    return {"ok": True, "title": clean}


@app.delete("/gallery/{item_id}")
def delete_gallery_item(item_id: str):
    item = gallery_store.get_item(item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Gallery item not found")
    gallery_store.delete_item(item_id)
    # Stitched items own their files — clean up on deletion.
    if item["kind"] == "stitched":
        try:
            Path(item["video_path"]).unlink(missing_ok=True)
            if item.get("thumbnail_path"):
                Path(item["thumbnail_path"]).unlink(missing_ok=True)
        except Exception:
            pass
    return {"ok": True}


@app.post("/stitch", status_code=201)
def stitch_gallery_items(
    item_ids: str = Form(...),
    title: Optional[str] = Form(None),
):
    """Concat an ordered list of gallery items into a new stitched item.

    `item_ids` is a JSON array of gallery item IDs, in the order they should
    appear in the output. Source items remain in the gallery untouched.
    """
    import json as _json
    try:
        ordered_ids: list[str] = _json.loads(item_ids)
    except Exception:
        raise HTTPException(status_code=422, detail="item_ids must be a JSON array")
    if not isinstance(ordered_ids, list) or len(ordered_ids) < 2:
        raise HTTPException(status_code=422, detail="Provide at least 2 item ids to stitch")

    source_paths: list[Path] = []
    source_titles: list[str] = []
    for iid in ordered_ids:
        src = gallery_store.get_item(iid)
        if src is None:
            raise HTTPException(status_code=404, detail=f"Gallery item {iid} not found")
        vp = Path(src["video_path"])
        if not vp.exists():
            raise HTTPException(status_code=404, detail=f"Video file for {iid} is missing")
        source_paths.append(vp)
        source_titles.append(src["title"])

    stitched_id = str(uuid.uuid4())
    out_path = STITCH_DIR / f"{stitched_id}.mp4"

    try:
        concat_videos(source_paths, out_path)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    default_title = title or f"Stitched ({len(source_paths)} clips)"
    item = _register_gallery_video(
        video_path=out_path,
        kind="stitched",
        title=default_title,
        metadata={"source_ids": ordered_ids, "source_titles": source_titles},
    )
    if item is None:
        raise HTTPException(status_code=500, detail="Failed to register stitched item")
    return item


# ────────────────────────────────────────────────────────────────────────────
# Restyle + pipeline
# ────────────────────────────────────────────────────────────────────────────


@app.post("/jobs/{job_id}/restyle", status_code=202)
async def restyle_job(
    job_id: str,
    component_rows: str = Form("[]"),
    style_prompt: str = Form(""),
    selected_variants: str = Form("x,y,z"),
):
    source_job = jobs.get_job(job_id)
    if source_job is None:
        raise HTTPException(status_code=404, detail="Source job not found")

    source_dir = UPLOAD_DIR / job_id
    variants = [v.strip() for v in selected_variants.split(",") if v.strip() in VARIANT_NAMES]
    if not variants:
        variants = list(VARIANT_NAMES)

    available = [v for v in variants if (source_dir / f"base_video_{v}.mp4").exists()]
    if not available:
        raise HTTPException(status_code=425, detail="Base video not ready — cannot restyle")

    import json as _json
    try:
        parsed_rows: list[dict] = _json.loads(component_rows)
        if not isinstance(parsed_rows, list):
            parsed_rows = []
    except Exception:
        parsed_rows = []

    new_job_id = jobs.create_job()
    new_dir = UPLOAD_DIR / new_job_id
    new_dir.mkdir(parents=True, exist_ok=True)

    import shutil as _shutil
    for v in available:
        _shutil.copy2(source_dir / f"base_video_{v}.mp4", new_dir / f"base_video_{v}.mp4")

    asyncio.create_task(
        _run_phase4_only(new_job_id, parsed_rows, style_prompt, available)
    )

    return {"job_id": new_job_id}


async def _run_phase4_only(
    job_id: str,
    rows: list[dict],
    style_prompt: str,
    variants: list[str],
) -> None:
    output_dir = UPLOAD_DIR / job_id
    try:
        fal_key = os.environ.get("FAL_KEY", "") if _FAL_ENABLED else ""
        if not fal_key:
            import logging
            logging.warning("FAL_KEY not set; skipping restyle phase 4")
            jobs.update_phase(job_id, 4, "done")
            jobs.mark_done(job_id, ai_styled=False)
            return

        jobs.update_phase(job_id, 4, "running")
        from pipeline.prompt_interpreter import build_fal_prompt
        from pipeline.phase4_video import KlingVideoEditor

        fal_prompt = build_fal_prompt(rows=rows, style_prompt=style_prompt)
        editor = KlingVideoEditor(fal_key=fal_key)

        style_tasks = [
            editor.edit(
                output_dir / f"base_video_{v}.mp4",
                fal_prompt,
                output_dir / f"final_video_{v}.mp4",
            )
            for v in variants
            if (output_dir / f"base_video_{v}.mp4").exists()
        ]

        if style_tasks:
            await asyncio.gather(*style_tasks)

        # Styled loops + gallery auto-save for the restyle flow.
        from pipeline.phase3_assemble import FrameAssembler as _FA
        loop_assembler = _FA()
        loop_tasks = []
        for variant in variants:
            styled_path = output_dir / f"final_video_{variant}.mp4"
            styled_loop_path = output_dir / f"final_loop_video_{variant}.mp4"
            if styled_path.exists():
                loop_tasks.append(
                    asyncio.to_thread(
                        loop_assembler.reverse_and_concat,
                        styled_path, styled_loop_path,
                    )
                )
        if loop_tasks:
            await asyncio.gather(*loop_tasks, return_exceptions=True)

        for variant in variants:
            styled_path = output_dir / f"final_video_{variant}.mp4"
            styled_loop_path = output_dir / f"final_loop_video_{variant}.mp4"
            if styled_path.exists():
                _register_gallery_video(
                    video_path=styled_path, kind="styled",
                    title=f"Restyle · {variant.upper()} axis",
                    job_id=job_id, variant=variant,
                    metadata={"style_prompt": style_prompt, "style": "styled", "restyle": True},
                )
            if styled_loop_path.exists():
                _register_gallery_video(
                    video_path=styled_loop_path, kind="loop",
                    title=f"Restyle 6s loop · {variant.upper()} axis",
                    job_id=job_id, variant=variant,
                    metadata={"source": "styled", "style": "styled", "restyle": True},
                )

        jobs.update_phase(job_id, 4, "done")
        jobs.mark_done(job_id, ai_styled=len(style_tasks) > 0)

    except Exception as exc:
        jobs.mark_error(job_id, 4, str(exc))


async def _run_pipeline(
    job_id: str,
    cad_path: Path,
    scalar: float,
    rows: list[dict] | None = None,
    style_prompt: str = "",
    camera_direction: list[float] | None = None,
    rotation_offset_deg: float = 0.0,
    orbit_range_deg: float = 40.0,
    camera_zoom: float = 1.0,
    variants_to_render: list[str] | None = None,
    auto_approve: bool = False,
    easing_curve: list[float] | None = None,
    orbit_mode: str = "horizontal",
    orbit_direction: int = 1,
    orbit_easing: list[float] | None = None,
) -> None:
    _variants = variants_to_render or list(VARIANT_NAMES)
    output_dir = UPLOAD_DIR / job_id
    output_dir.mkdir(parents=True, exist_ok=True)

    try:
        # -- Phase 1: geometry -------------------------------------------------
        jobs.update_phase(job_id, 1, "running")
        from pipeline.phase1_geometry import GeometryAnalyzer
        analyzer = GeometryAnalyzer()
        meshes = await asyncio.to_thread(analyzer.load, str(cad_path))
        meshes = analyzer.reorient(meshes)
        x_vecs, y_vecs, z_vecs = await asyncio.to_thread(
            analyzer.triple_axis_explosion_vectors, meshes, scalar,
        )
        jobs.update_phase(job_id, 1, "done")

        # -- Phase 2: render only requested variants (sequential — pyrender
        #    requires the main thread on macOS; no parallelism possible here).
        jobs.update_phase(job_id, 2, "running")
        from pipeline.phase2_snapshots import SnapshotRenderer
        renderer = SnapshotRenderer()

        render_kwargs = dict(
            camera_direction=camera_direction,
            num_frames=72,
            orbit_range_deg=orbit_range_deg,
            rotation_offset_deg=rotation_offset_deg,
            camera_zoom=camera_zoom,
            easing_curve=easing_curve,
            orbit_mode=orbit_mode,
            orbit_direction=orbit_direction,
            orbit_easing=orbit_easing,
        )

        variant_vecs = {"x": x_vecs, "y": y_vecs, "z": z_vecs}
        for variant in _variants:
            print(f"[Phase 2] Rendering {variant}-axis variant...")
            renderer.render_video_frames(
                meshes, variant_vecs[variant],
                output_dir=output_dir / f"video_frames_{variant}",
                **render_kwargs,
            )
        jobs.update_phase(job_id, 2, "done")

        # -- Phase 3: assemble requested variants (ffmpeg runs in threads) -----
        jobs.update_phase(job_id, 3, "running")
        from pipeline.phase3_assemble import FrameAssembler
        assembler = FrameAssembler()

        assemble_tasks = [
            asyncio.to_thread(
                assembler.assemble,
                output_dir / f"video_frames_{v}",
                output_dir / f"base_video_{v}.mp4",
            )
            for v in _variants
        ]
        await asyncio.gather(*assemble_tasks)

        loop_tasks = [
            asyncio.to_thread(
                assembler.reverse_and_concat,
                output_dir / f"base_video_{v}.mp4",
                output_dir / f"loop_video_{v}.mp4",
            )
            for v in _variants
        ]
        await asyncio.gather(*loop_tasks)
        jobs.update_phase(job_id, 3, "done")

        # Auto-save unstyled renders + loops to gallery (non-fatal if it fails).
        for v in _variants:
            base_path = output_dir / f"base_video_{v}.mp4"
            loop_path = output_dir / f"loop_video_{v}.mp4"
            if base_path.exists():
                _register_gallery_video(
                    video_path=base_path, kind="base",
                    title=f"Base render · {v.upper()} axis",
                    job_id=job_id, variant=v,
                    metadata={"explode_scalar": scalar, "style": "unstyled"},
                )
            if loop_path.exists():
                _register_gallery_video(
                    video_path=loop_path, kind="loop",
                    title=f"6s loop · {v.upper()} axis",
                    job_id=job_id, variant=v,
                    metadata={"source": "base", "style": "unstyled"},
                )

        # -- Phase 4: Kling styling -----------------------------------------------
        # When auto_approve is True (single-variant new flow), skip the approval
        # gate and proceed immediately with the rendered variants.
        if auto_approve:
            selected = _variants
        else:
            approval_event = jobs.mark_awaiting_approval(job_id)
            await approval_event.wait()

            overrides = jobs.get_approval_style(job_id)
            if overrides:
                rows = overrides.get("rows") or rows
                style_prompt = overrides.get("style_prompt", style_prompt)

            selected = jobs.get_approval_variants(job_id)

        fal_key = os.environ.get("FAL_KEY", "") if _FAL_ENABLED else ""
        if not fal_key:
            import logging
            logging.warning("FAL_KEY not set; skipping Phase 4 Kling edit")
            jobs.update_phase(job_id, 4, "done")
            jobs.mark_done(job_id, ai_styled=False)
            return

        jobs.update_phase(job_id, 4, "running")
        from pipeline.prompt_interpreter import build_fal_prompt
        from pipeline.phase4_video import KlingVideoEditor

        fal_prompt = build_fal_prompt(
            rows=rows,
            style_prompt=style_prompt,
        )

        editor = KlingVideoEditor(fal_key=fal_key)
        style_tasks = []
        for variant in selected:
            base_path = output_dir / f"base_video_{variant}.mp4"
            final_path = output_dir / f"final_video_{variant}.mp4"
            if base_path.exists():
                style_tasks.append(editor.edit(base_path, fal_prompt, final_path))

        if style_tasks:
            await asyncio.gather(*style_tasks)

        # Produce styled 6-second loops (reverse + concat) for every styled
        # variant, then register both the styled and its loop into the gallery.
        from pipeline.phase3_assemble import FrameAssembler as _FA
        loop_assembler = _FA()
        styled_loop_tasks = []
        for variant in selected:
            styled_path = output_dir / f"final_video_{variant}.mp4"
            styled_loop_path = output_dir / f"final_loop_video_{variant}.mp4"
            if styled_path.exists():
                styled_loop_tasks.append(
                    asyncio.to_thread(
                        loop_assembler.reverse_and_concat,
                        styled_path, styled_loop_path,
                    )
                )
        if styled_loop_tasks:
            await asyncio.gather(*styled_loop_tasks, return_exceptions=True)

        for variant in selected:
            styled_path = output_dir / f"final_video_{variant}.mp4"
            styled_loop_path = output_dir / f"final_loop_video_{variant}.mp4"
            if styled_path.exists():
                _register_gallery_video(
                    video_path=styled_path, kind="styled",
                    title=f"AI styled · {variant.upper()} axis",
                    job_id=job_id, variant=variant,
                    metadata={"style_prompt": style_prompt, "style": "styled"},
                )
            if styled_loop_path.exists():
                _register_gallery_video(
                    video_path=styled_loop_path, kind="loop",
                    title=f"6s styled loop · {variant.upper()} axis",
                    job_id=job_id, variant=variant,
                    metadata={"source": "styled", "style": "styled"},
                )

        jobs.update_phase(job_id, 4, "done")
        jobs.mark_done(job_id, ai_styled=len(style_tasks) > 0)

    except Exception as exc:
        current_job = jobs.get_job(job_id)
        phase = current_job.current_phase if current_job else 1
        jobs.mark_error(job_id, phase, str(exc))
