"""Real Blender regressions. Run with --python via runtime_regression.mjs."""
import importlib.util
import json
import os
import sys
from pathlib import Path
import bpy

ROOT = Path(__file__).resolve().parents[2]
RT = ROOT / 'bridge' / 'runtime'
out = Path(sys.argv[sys.argv.index('--') + 1])
out.mkdir(parents=True, exist_ok=True)
sys.path.insert(0, str(RT))
import offline_bootstrap
ns = offline_bootstrap.boot(['presets'])
K = ns['K']
K.out_dir = str(out)
spec = importlib.util.spec_from_file_location('regression_worker', RT / 'worker.py')
w = importlib.util.module_from_spec(spec)
spec.loader.exec_module(w)
os.environ['DSH_WORKER_FRAME_DIR'] = str(out)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.mesh.primitive_cube_add(size=2)
o = bpy.context.object
o.name = 'RegressionCube'
bpy.context.scene.render.use_stamp = True
before = len(bpy.data.cameras)
shots = [w._see({'width': 160, 'height': 120}) for _ in range(3)]
assert all(s['ok'] and s['coverage_estimate'] > 0 for s in shots), shots
assert len(bpy.data.cameras) == before, 'Temporary camera datablocks leaked'
camera_after = len(bpy.data.cameras)
assert bpy.context.scene.render.use_stamp is True, 'Diagnostic render changed stamp preference'
watch = w._watch({'frames': [1, 2], 'max_frames': 2, 'width': 160, 'height': 120})
assert watch['ok'] and watch['distinct'] == 1 and not watch['changed'], watch
# A real visible transform must still change the pixel digest.
o.location.x = -2
o.keyframe_insert(data_path='location', frame=1)
o.location.x = 2
o.keyframe_insert(data_path='location', frame=2)
animated = w._watch({'frames': [1, 2], 'max_frames': 2, 'width': 160, 'height': 120})
assert animated['ok'] and animated['distinct'] == 2 and animated['changed'], animated
failed = w._watch({'code': "raise ValueError('regression')", 'frames': [1], 'max_frames': 1})
assert not failed['ok'] and not failed['frames'], failed
# Object and scene dry-run paths must be read-only; real application still writes.
o.animation_data_clear()
o.location = (1, 2, 3)
p = K.dsh_preset_api
p('save', {'name': 'object-regression', 'data': {'location': [9, 9, 9]}})
p('apply', {'name': 'object-regression', 'targets': ['OBJ:RegressionCube'], 'dry_run': True})
assert list(o.location) == [1, 2, 3], 'Object preset dry-run changed transform'
p('apply', {'name': 'object-regression', 'targets': ['OBJ:RegressionCube']})
assert list(o.location) == [9, 9, 9], 'Real preset apply did not write'
bpy.context.scene.render.resolution_x = 640
p('save', {'name': 'scene-regression', 'data': {'render.resolution_x': 128}})
p('apply', {'name': 'scene-regression', 'targets': ['SCENE'], 'dry_run': True})
assert bpy.context.scene.render.resolution_x == 640, 'Scene preset dry-run changed settings'
p('apply', {'name': 'scene-regression', 'targets': ['SCENE']})
assert bpy.context.scene.render.resolution_x == 128, 'Real scene preset apply did not write'
# Check all default EEVEE selectors against Blender's actual engine enum.
bpy.ops.wm.read_factory_settings(use_empty=False)
engine_info = w._engine_setup('auto', 'eevee')
assert engine_info['ok'] and 'EEVEE' in engine_info['after']['engine'], engine_info
offline_bootstrap.boot(['perf'])
sc = bpy.context.scene
ee = sc.eevee
if hasattr(ee, 'use_raytracing'):
    ee.use_raytracing = False
if hasattr(ee, 'taa_render_samples'):
    ee.taa_render_samples = 16
perf_before = K.dsh_perf_api('status', {})
perf = K.dsh_perf_api('apply', {})
assert perf['ok'] and 'EEVEE' in perf['engine'], perf
assert K.dsh_perf_api('status', {})['preset_applied'] is True
reverted = K.dsh_perf_api('revert', {})
assert reverted['ok'] and reverted['reverted'], reverted
perf_after = K.dsh_perf_api('status', {})
assert perf_before['eevee'] == perf_after['eevee'], (perf_before, perf_after)
assert perf_before['engine'] == perf_after['engine']
assert perf_after['preset_applied'] is False and perf_after['saved_snapshot'] is None
# A second transaction restores new user settings, not the previous baseline.
if hasattr(ee, 'taa_render_samples'):
    ee.taa_render_samples = 24
perf_second = K.dsh_perf_api('status', {})
assert K.dsh_perf_api('apply', {})['ok']
assert K.dsh_perf_api('revert', {})['ok']
assert K.dsh_perf_api('status', {})['eevee'] == perf_second['eevee']
# Existing Cycles presets retain their reversible behavior after EEVEE use.
sc.render.engine = 'CYCLES'
sc.cycles.samples = 37
cycles_before = K.dsh_perf_api('status', {})
assert K.dsh_perf_api('apply', {'samples': 64})['ok']
assert sc.cycles.samples == 64
assert K.dsh_perf_api('revert', {})['ok']
cycles_after = K.dsh_perf_api('status', {})
for key in ['engine', 'device', 'samples', 'adaptive', 'persistent_data', 'denoiser', 'auto_tile', 'resolution']:
    assert cycles_before[key] == cycles_after[key], (key, cycles_before, cycles_after)
sc.render.engine = engine_info.get('engine', perf['engine'])
import contextlib
import io
captured = io.StringIO()
with contextlib.redirect_stdout(captured):
    exec(compile((out / 'gpu-prelude.py').read_text(encoding='utf-8'), 'gpu-prelude.py', 'exec'), {})
prelude = json.loads(next(line[8:] for line in captured.getvalue().splitlines() if line.startswith('DSH_GPU ')))
assert prelude['ok'] and 'EEVEE' in prelude['after']['engine'], prelude
sc = bpy.context.scene
sc.render.resolution_x = 128
sc.render.resolution_y = 72
sc.render.resolution_percentage = 100
sc.render.image_settings.file_format = 'PNG'
sc.render.use_stamp = False
sc.render.filepath = str(out / 'eevee.png')
bpy.ops.render.render(write_still=True)
import struct
png = (out / 'eevee.png').read_bytes()
assert png[:8] == b'\x89PNG\r\n\x1a\n' and struct.unpack('>II', png[16:24]) == (128, 72), 'Invalid EEVEE PNG'
img = bpy.data.images.load(sc.render.filepath, check_existing=False)
pixels = list(img.pixels)
assert max(pixels[0::4]) - min(pixels[0::4]) > 0.05, 'EEVEE render has no visible variation'
bpy.data.images.remove(img)
result = {'ok': True, 'blender': bpy.app.version_string, 'camera_count_before': before,
          'camera_count_after': camera_after, 'static_distinct': watch['distinct'],
          'animated_distinct': animated['distinct'], 'watch_code_failure': failed['error'],
          'preset_object_and_scene_dry_run_read_only': True,
          'perf_eevee_and_cycles_apply_revert': True,
          'eevee': {'worker': engine_info, 'perf': perf, 'headless_prelude': prelude,
                    'png': str(out / 'eevee.png'), 'width': 128, 'height': 72}}
(out / 'regression.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
print('RUNTIME_REGRESSION ' + json.dumps(result))
