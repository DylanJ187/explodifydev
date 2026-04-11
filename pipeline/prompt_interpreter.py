# pipeline/prompt_interpreter.py
"""Prompt interpreter for Phase 4 (Kling video-to-video edit).

Kling o1 edit transforms the visual style of a video while preserving its
motion.  The prompt must accomplish two things at once:

  1. PRESERVE geometry, motion, timing, and camera exactly as-is.
  2. APPLY materials, lighting, and environment convincingly.

This module builds a structured prompt from user inputs (material description,
style toggles, free-text notes) by filling a template with dedicated sections.
Each section is tuned for how Kling interprets video-to-video edit prompts:

  - MOTION section:   anchors Kling to the source video's geometry.
  - MATERIAL section:  per-component surface descriptions.
  - LIGHTING section:  key/fill/rim/ambient setup.
  - ENVIRONMENT section: backdrop, ground plane, atmosphere.
  - CAMERA section:    reinforces "do not change the camera."

The template uses short, declarative sentences.  Kling responds better to
concrete visual descriptions ("brushed aluminium with fine radial grain")
than abstract instructions ("make it look professional").

Usage:
    from pipeline.prompt_interpreter import build_fal_prompt

    prompt = build_fal_prompt(
        material_prompt="brushed aluminium body, matte black cap, frosted glass lens",
        style_prompt="warm amber tone, subtle ground shadow",
        lighting="studio",       # from checkbox toggles
        backdrop="dark",         # from checkbox toggles
        component_names=["body", "cap", "lens", "spring"],
    )
"""
from __future__ import annotations

from dataclasses import dataclass, field


# ---------------------------------------------------------------------------
# Template sections
# ---------------------------------------------------------------------------

_MOTION = (
    "Photorealistic product render of a mechanical assembly. "
    "Preserve every component's shape, position, motion, and timing "
    "exactly as shown in the source video. Do not add, remove, or "
    "reposition any parts. Do not alter the camera path."
)

_LIGHTING_PRESETS: dict[str, str] = {
    "studio": (
        "Three-point studio lighting: soft key light from upper-left at 45 degrees, "
        "cool fill light from right at low intensity, subtle rim light from behind "
        "to separate components from the backdrop. Soft shadows, no harsh specular."
    ),
    "warm": (
        "Warm studio lighting: golden key light from upper-left, soft amber fill, "
        "gentle warm rim light. Shadows are soft with warm undertones."
    ),
    "cold": (
        "Cool clinical lighting: bright blue-white key light from above, "
        "neutral fill from the sides, crisp shadows. Medical-device aesthetic."
    ),
    "natural": (
        "Natural indirect lighting as if near a large north-facing window. "
        "Soft even illumination, minimal shadows, neutral colour temperature."
    ),
}

_BACKDROP_PRESETS: dict[str, str] = {
    "dark": (
        "Dark studio backdrop, nearly black with a subtle gradient. "
        "Polished dark ground plane showing faint reflections of the components."
    ),
    "white": (
        "Clean infinite white background, no visible horizon line. "
        "Soft ground-plane shadow directly beneath the assembly."
    ),
    "gradient": (
        "Smooth dark-to-mid-grey vertical gradient backdrop. "
        "Subtle ground plane with soft contact shadows."
    ),
}

_DEFAULT_MATERIAL = (
    "Each component rendered with physically accurate materials: "
    "machined metal surfaces with fine tooling marks, subtle anodisation, "
    "accurate Fresnel reflections. Plastic parts have slight subsurface "
    "scattering. Glass and transparent elements show realistic refraction."
)

_CAMERA = (
    "Camera: match the source video exactly. Same focal length, same orbit "
    "path, same timing. No zoom, no shake, no post-processing effects."
)

_QUALITY = (
    "8K product photography quality. Shallow depth of field with all "
    "components in focus. No motion blur. No lens flare. No vignette. "
    "No watermarks or text overlays."
)


# ---------------------------------------------------------------------------
# Structured prompt config
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class PromptConfig:
    """Parsed user inputs ready for template filling."""
    material_prompt: str = ""
    style_notes: str = ""
    lighting: str = "studio"
    backdrop: str = "dark"
    ground_shadow: bool = True
    component_names: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def build_fal_prompt(
    material_prompt: str = "",
    style_prompt: str = "",
    lighting: str = "studio",
    backdrop: str = "dark",
    ground_shadow: bool = True,
    component_names: list[str] | None = None,
) -> str:
    """Build a structured Kling o1 edit prompt from user inputs.

    Args:
        material_prompt:  Free-text material description from the user.
                          e.g. "brushed aluminium body, matte black cap"
        style_prompt:     Free-text style notes (mood, colour, extras).
        lighting:         Lighting preset key: "studio", "warm", "cold", "natural".
        backdrop:         Backdrop preset key: "dark", "white", "gradient".
        ground_shadow:    Whether to include ground-plane shadow language.
        component_names:  Optional list of mesh names from Phase 1, used to
                          ground the material description to specific parts.

    Returns:
        A single prompt string with clearly separated sections.
    """
    sections: list[str] = []

    # 1. Motion preservation (always first -- highest priority for Kling)
    sections.append(_MOTION)

    # 2. Materials
    sections.append(_build_material_section(material_prompt, component_names or []))

    # 3. Lighting
    lighting_key = lighting if lighting in _LIGHTING_PRESETS else "studio"
    sections.append(_LIGHTING_PRESETS[lighting_key])

    # 4. Environment / backdrop
    backdrop_key = backdrop if backdrop in _BACKDROP_PRESETS else "dark"
    env = _BACKDROP_PRESETS[backdrop_key]
    if not ground_shadow:
        env = env.replace("shadow", "").replace("reflection", "")
    sections.append(env)

    # 5. Free-text style notes (user's extras -- appended, not dominant)
    if style_prompt.strip():
        sections.append(f"Additional style: {style_prompt.strip()}")

    # 6. Camera lock + quality (always last -- reinforcement)
    sections.append(_CAMERA)
    sections.append(_QUALITY)

    return " ".join(sections)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _build_material_section(
    material_prompt: str,
    component_names: list[str],
) -> str:
    """Build the material description section.

    If the user provided material text, use it directly.  If component names
    are available, prefix with a part inventory so Kling can ground materials
    to specific geometry.
    """
    if not material_prompt.strip():
        return _DEFAULT_MATERIAL

    parts: list[str] = []

    # Give Kling a parts list so it can map materials to geometry
    if component_names:
        names = ", ".join(component_names[:12])  # cap to avoid prompt bloat
        parts.append(f"Assembly components: {names}.")

    parts.append(f"Materials: {material_prompt.strip()}.")
    parts.append(
        "Apply each material with physically accurate properties: "
        "correct Fresnel reflections, surface roughness, and specularity."
    )

    return " ".join(parts)


def resolve_lighting_key(
    studio_lighting: bool,
    warm_tone: bool,
    cold_tone: bool,
) -> str:
    """Map frontend checkbox state to a lighting preset key."""
    if warm_tone:
        return "warm"
    if cold_tone:
        return "cold"
    if studio_lighting:
        return "studio"
    return "natural"


def resolve_backdrop_key(
    dark_backdrop: bool,
    white_backdrop: bool,
) -> str:
    """Map frontend checkbox state to a backdrop preset key."""
    if dark_backdrop:
        return "dark"
    if white_backdrop:
        return "white"
    return "gradient"
