# pipeline/models.py
from dataclasses import dataclass

import trimesh

# Formats loaded natively by trimesh (no conversion needed)
TRIMESH_FORMATS = frozenset({
    ".glb", ".gltf", ".obj", ".stl", ".ply", ".off", ".3mf",
})

# Formats converted via cascadio (OpenCASCADE STEP reader -> GLB intermediate)
CASCADIO_FORMATS = frozenset({
    ".step", ".stp",
})

# Zip archives containing a supported mesh file (OBJ+MTL bundle, etc.)
ZIP_FORMATS = frozenset({".zip"})

ALL_SUPPORTED_FORMATS = TRIMESH_FORMATS | CASCADIO_FORMATS | ZIP_FORMATS

UNSUPPORTED_FORMAT_HELP = """
Only STEP (.step / .stp), mesh files (GLB, OBJ, STL, PLY, 3MF), and ZIP archives
containing a mesh file are supported.

To convert a proprietary CAD file to STEP:

  SolidWorks:    File -> Save As -> STEP AP214 or AP242
  Fusion 360:    File -> Export -> STEP
  Inventor:      File -> Save As -> STEP
  CATIA:         File -> Save As -> STEP
  Onshape:       Export -> STEP
  FreeCAD:       File -> Export -> STEP

Supported: {supported}
""".format(supported=", ".join(sorted(ALL_SUPPORTED_FORMATS)))


class UnsupportedFormatError(ValueError):
    """Raised when the input file format cannot be loaded by Explodify."""


@dataclass
class NamedMesh:
    """A single component mesh with its assembly name."""
    name: str
    mesh: trimesh.Trimesh



