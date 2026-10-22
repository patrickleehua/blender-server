"""Run with Blender --background --python to independently inspect host outputs."""
import json
import math
import os
import sys
from pathlib import Path

import bpy


root = Path(sys.argv[sys.argv.index("--") + 1]).resolve()
prefix = sys.argv[sys.argv.index("--") + 2]
out = root / "outputs"
expected = {
    prefix + "Top": ((0.9, 0.9, 0.08), (0, 0, 0.79)),
    prefix + "LegA": ((0.08, 0.08, 0.75), (-0.28, -0.22, 0.375)),
    prefix + "LegB": ((0.08, 0.08, 0.75), (0.28, -0.22, 0.375)),
    prefix + "LegC": ((0.08, 0.08, 0.75), (0, 0.28, 0.375)),
}


def inspect_scene():
    from mathutils import Vector
    observed = {}
    for name, (size, center) in expected.items():
        obj = bpy.data.objects.get(name)
        assert obj and obj.type == "MESH", f"Missing mesh: {name}"
        corners = [obj.matrix_world @ Vector(p) for p in obj.bound_box]
        low = [min(p[i] for p in corners) for i in range(3)]
        high = [max(p[i] for p in corners) for i in range(3)]
        actual_size = [high[i] - low[i] for i in range(3)]
        actual_center = [(high[i] + low[i]) / 2 for i in range(3)]
        assert all(abs(actual_size[i] - size[i]) < 0.002 for i in range(3)), (name, actual_size, size)
        assert all(abs(actual_center[i] - center[i]) < 0.002 for i in range(3)), (name, actual_center, center)
        assert len(obj.data.vertices) >= 8, f"Degenerate geometry: {name}"
        observed[name] = {"size_m": actual_size, "center_m": actual_center, "vertices": len(obj.data.vertices)}
    return observed


blend = out / "stool.blend"
glb = out / "stool.glb"
assert blend.is_file() and blend.stat().st_size > 1024, "Blend missing/empty"
assert glb.is_file() and glb.read_bytes()[:4] == b"glTF", "GLB missing/invalid signature"
bpy.ops.wm.open_mainfile(filepath=str(blend))
blend_scene = inspect_scene()
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(glb))
glb_scene = inspect_scene()
result = {"ok": True, "root": str(root), "blend": blend_scene, "glb": glb_scene,
          "files": {p.name: p.stat().st_size for p in [blend, glb]}, "blender_version": bpy.app.version_string}
destination = root / "independent-check.json"
destination.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
print("HOST_ARTIFACT_CHECK " + json.dumps(result, ensure_ascii=False))
