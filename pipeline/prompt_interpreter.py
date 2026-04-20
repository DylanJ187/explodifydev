# pipeline/prompt_interpreter.py
"""Prompt interpreter for Phase 4 (Kling o1 video-to-video edit).

Kling o1 has no strength/guidance parameter — fidelity is controlled purely by
the prompt. Structure: geometry lock, render style, materials, optional user
notes. Kept compact to minimise tokens while covering every constraint once.
"""
from __future__ import annotations


_GEOMETRY_LOCK = (
    "STRICT SURFACE-ONLY RESTYLE. This is a pixel-accurate material remap, "
    "not a regeneration. Do not modify geometry, part count, individual part "
    "shapes, relative positions, motion paths, explosion trajectory, camera "
    "angle, orbit arc, or frame timing — every pixel of silhouette and every "
    "axis of movement must match the source. Only surface appearance "
    "(colour, material, shading) may change. Output must be frame-for-frame "
    "aligned to the input."
)

_RENDER_STYLE = (
    "Style: photoreal product visualisation, Blender Cycles quality — never cartoon or stylised. "
    "Surfaces carry high-resolution micro-detail: visible grain, weave, brushed striations, "
    "fingerprint-scale wear, fine specular highlights, subtle normal-map relief — "
    "textures read as tactile and hand-crafted under close inspection. "
    "Background: preserve the exact source background colour pixel-for-pixel — do not recolour, gradient, tint, or add horizon, seams, or backdrop edges. "
    "Lighting: soft area lights, no ground shadow, no floor reflection. "
    "No lens flare, bloom, glow, motion blur, bokeh, or chromatic aberration. "
    "Flicker-free exposure and materials across all frames."
)

_GEOMETRY_REASSERT = (
    "Reminder: geometry, part count, positions, motion, camera trajectory, "
    "and timing must remain frame-for-frame identical to the source. Style "
    "notes above apply to surfaces only — never to geometry or motion."
)

_AUTO_MATERIALS_ALL = (
    "Materials: identify the main body and each sub-component, then assign "
    "coherent PBR materials inferred from shape and function (e.g. metal chassis, "
    "rubber grips, glass lenses, painted plastic). Unified premium palette."
)

_AUTO_MATERIALS_PARTIAL = (
    "For any unlisted component, infer a material that harmonises with the "
    "specified ones — matching palette, finish, and realism."
)

_ATMOSPHERIC_BAN = (
    "No smoke, dust, haze, fog, mist, steam, or atmospheric particles — "
    "the air is perfectly clear."
)

_ATMOSPHERIC_TERMS = (
    "smoke", "dust", "haze", "fog", "mist", "steam",
    "atmospheric", "atmosphere", "particles", "volumetric", "god ray",
)

# Kling v2v endpoints reject prompts over 2500 chars. Leave margin for safety
# so off-by-one or endpoint drift doesn't surface as a late-stage API 400.
_FAL_PROMPT_CHAR_LIMIT = 2400


def _style_mentions_atmosphere(style_prompt: str) -> bool:
    low = style_prompt.lower()
    return any(term in low for term in _ATMOSPHERIC_TERMS)


def build_fal_prompt(
    rows: list[dict] | None = None,
    style_prompt: str = "",
) -> str:
    """Build a concise, geometry-preserving Kling o1 edit prompt.

    Args:
        rows: List of dicts with 'part' and 'material' keys.
        style_prompt: Free-form style notes (lighting, backdrop, mood).
    """
    sections: list[str] = [_GEOMETRY_LOCK, _RENDER_STYLE, _build_rows_section(rows or [])]
    if not _style_mentions_atmosphere(style_prompt):
        sections.append(_ATMOSPHERIC_BAN)
    if style_prompt.strip():
        sections.append(style_prompt.strip())
    sections.append(_GEOMETRY_REASSERT)
    return _clamp_to_limit(" ".join(sections))


def _clamp_to_limit(prompt: str) -> str:
    """Hard-clamp the final prompt under the Kling endpoint char limit.

    Trims from the middle (user/material content) rather than the tail, so the
    geometry reassertion at the end — the single most load-bearing clause —
    always survives.
    """
    if len(prompt) <= _FAL_PROMPT_CHAR_LIMIT:
        return prompt
    tail = " " + _GEOMETRY_REASSERT
    head_budget = _FAL_PROMPT_CHAR_LIMIT - len(tail) - 1
    head = prompt[: max(0, head_budget)].rstrip(" ,")
    return f"{head}{tail}"


def _build_rows_section(rows: list[dict]) -> str:
    """Serialise component/material rows into a concise prompt fragment."""
    filled: list[str] = []
    unfilled_count = 0
    for i, row in enumerate(rows[:20]):
        part = (row.get("part") or "").strip() or f"Part {i + 1}"
        material = (row.get("material") or "").strip()
        if material:
            filled.append(f"{part} is {material}")
        else:
            unfilled_count += 1

    if not filled:
        return _AUTO_MATERIALS_ALL

    components = "Components: " + ", ".join(filled) + "."
    if unfilled_count > 0:
        return components + " " + _AUTO_MATERIALS_PARTIAL
    return components
