// engine="none" must preserve the input engine and skip all GPU/EEVEE setup.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const exe = process.env.BLENDER_AGENT_EXE || process.env.DSH_BLENDER_EXE;
if (!exe) throw new Error('Set BLENDER_AGENT_EXE to a real Blender executable.');
const out = path.resolve(process.env.BLENDER_AGENT_TEST_OUT || path.join(root, 'tmp/job-none'));
fs.mkdirSync(out, { recursive: true });
const blend = path.join(out, 'input-cycles.blend');
const setup = path.join(out, 'setup.py');
fs.writeFileSync(setup, `import bpy\nbpy.context.scene.render.engine = 'CYCLES'\nbpy.ops.wm.save_as_mainfile(filepath=${JSON.stringify(blend)})\n`);
const made = spawnSync(exe, ['-b', '--factory-startup', '--python-exit-code', '1', '--python', setup], { encoding: 'utf8', windowsHide: true });
fs.writeFileSync(path.join(out, 'setup.stdout.log'), made.stdout || '');
fs.writeFileSync(path.join(out, 'setup.stderr.log'), made.stderr || '');
assert.equal(made.status, 0, made.stderr);
process.env.DSH_BLENDER_EXE = exe;
process.env.DSH_BLENDER_WORKDIR = out;
const { createEngine } = await import('../../bridge/runtime/engine.mjs');
const engine = createEngine();
try {
  const job = engine.job.start({ engine: 'none', file: blend, factoryStartup: false, outdir: out,
    script: 'import bpy, json\nassert bpy.context.scene.render.engine == "CYCLES", bpy.context.scene.render.engine\nprint("HEADLESS " + json.dumps({"engine": bpy.context.scene.render.engine, "preserved": True}))' });
  const result = await engine.job.wait(job.id, 60000);
  const stdout = fs.readFileSync(result.stdoutLogWsl, 'utf8');
  assert.equal(result.status, 'done', JSON.stringify(result));
  assert.equal(result.resultJson.engine, 'CYCLES');
  assert.equal(result.resultJson.preserved, true);
  assert.equal(stdout.includes('DSH_GPU '), false, 'engine=none unexpectedly executed the GPU prelude');
  const evidence = { ok: true, inputEngine: 'CYCLES', actualEngine: result.resultJson.engine, gpuPreludeAbsent: true, jobId: result.id, stdoutLog: result.stdoutLogWsl, blender: exe };
  fs.writeFileSync(path.join(out, 'job-none.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
} finally { await engine.stop(); }
