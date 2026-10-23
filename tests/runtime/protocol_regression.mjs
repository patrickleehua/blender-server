// Real Blender regressions for failure signals, opt dispatch and scene ownership.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const exe = process.env.BLENDER_AGENT_EXE || process.env.DSH_BLENDER_EXE;
if (!exe) throw new Error('Set BLENDER_AGENT_EXE to a real Blender executable.');
const out = path.resolve(process.env.BLENDER_AGENT_TEST_OUT || path.join(root, 'tmp/runtime-protocol'));
fs.mkdirSync(out, { recursive: true });
process.env.DSH_BLENDER_EXE = exe;
process.env.DSH_BLENDER_WORKDIR = out;
process.env.DSH_BLENDER_ADDON_PORT = '42878';
process.env.DSH_BLENDER_WORKER_PORT = '42879';
const { startRuntimeServer } = await import('../../bridge/runtime/server.mjs');
const { createEngine } = await import('../../bridge/runtime/engine.mjs');
let e;
const sockets = new Set();
// Only the addon wire is simulated. Every execute_code request runs unchanged
// in real Blender, so engine.opt injection and Python dispatch remain real.
const addonWire = net.createServer(socket => {
  sockets.add(socket); socket.once('close', () => sockets.delete(socket));
  let buffer = '', queue = Promise.resolve();
  socket.on('data', chunk => {
    buffer += chunk.toString('utf8');
    let message;
    try { message = JSON.parse(buffer); } catch { return; }
    buffer = '';
    queue = queue.then(async () => {
      if (message.type !== 'execute_code') return socket.write(JSON.stringify({ status: 'success', result: {} }));
      const result = await e.worker.exec(message.params.code, 60000, null, 'shared');
      socket.write(JSON.stringify(result.ok ? { status: 'success', result: { result: result.stdout } }
        : { status: 'error', message: result.traceback || result.error }));
    }).catch(error => socket.write(JSON.stringify({ status: 'error', message: error.message })));
  });
});
await new Promise((resolve, reject) => { addonWire.once('error', reject); addonWire.listen(42878, '127.0.0.1', resolve); });
const runtime = await startRuntimeServer({ port: 42877 });
e = runtime.engine;
const evidence = { blender: exe, calls: [] };
async function http(route, body) {
  const response = await fetch('http://127.0.0.1:42877' + route, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(60000),
  });
  const text = await response.text();
  const result = JSON.parse(text.trim().split('\n').filter(line => !JSON.parse(line).heartbeat).at(-1));
  evidence.calls.push({ route, body, status: response.status, result });
  return { status: response.status, result };
}
async function worker(holder, op, extra = {}) {
  return http('/worker', { isolated: true, holder, op, name: 'shared', ...extra });
}
try {
  assert.equal((await http('/lease', { holder: 'owner-a' })).result.ok, true);
  const started = await worker('owner-a', 'start', { engine: 'workbench', warmup: false });
  assert.equal(started.result.result.ready, true);
  const pid = started.result.result.pid;
  const built = await worker('owner-a', 'exec', { code: 'bpy.ops.wm.read_factory_settings(use_empty=True)\nbpy.ops.mesh.primitive_cube_add(size=3)\nbpy.context.object.name="OwnedCube"\nK.owner="A"' });
  assert.equal(built.result.ok, true);
  for (const op of ['start', 'exec', 'reset', 'stop', 'restart', 'see', 'watch']) {
    const blocked = await worker('owner-b', op, { name: 'SHARED', code: 'bpy.data.objects.remove(bpy.data.objects["OwnedCube"], do_unlink=True)' });
    assert.equal(blocked.status, 409, op + ' crossed worker ownership');
    assert.equal(blocked.result.code, 'WORKER_OWNED');
    assert.equal(blocked.result.holder, 'owner-a');
  }
  const publicStatus = await worker('owner-b', 'status');
  assert.equal(publicStatus.status, 200);
  assert.equal(publicStatus.result.result.pid, pid);
  assert.equal(publicStatus.result.result.holder, 'owner-a');
  const publicList = await worker('owner-b', 'list');
  assert.equal(publicList.result.result.workers.some(w => w.name === 'shared' && w.pid === pid), true);
  const independent = await worker('owner-b', 'start', { name: 'independent', engine: 'workbench', warmup: false });
  assert.equal(independent.result.result.ready, true, 'Different workers must not take the global GUI lease');
  assert.notEqual(independent.result.result.pid, pid);
  assert.equal((await worker('owner-a', 'exec', { code: 'assert K.owner=="A"\nassert "OwnedCube" in bpy.data.objects\nassert bpy.data.objects["OwnedCube"].dimensions.x==3' })).result.ok, true);

  // Exercise the actual engine.opt wrapper and real perf module. The transport
  // adapter executes addon code in our isolated real worker, never in a GUI.
  {
    assert.equal((await worker('owner-a', 'exec', { code: 'bpy.ops.mesh.primitive_cube_add(size=1, location=(5,0,0))\nbpy.context.object.name="OtherCube"' })).result.ok, true);
    const analyzed = await e.opt('analyze', {});
    assert.equal(analyzed.ok, true);
    assert.equal(analyzed.objects, 2);
    assert.equal(analyzed.joinable, 2);
    assert.ok(Array.isArray(analyzed.top_groups), 'opt analyze must return object candidates, not render benchmarks');
    const dry = await e.opt('join', { dry_run: true });
    assert.equal(dry.ok, true);
    assert.equal(dry.dry_run, true);
    assert.equal(dry.objects_before, 2);
    const joined = await e.opt('join', { dry_run: false });
    assert.equal(joined.ok, true);
    assert.equal(joined.groups_joined, 1);
    assert.deepEqual(joined.objects, [2, 1]);
    assert.equal(joined.faces[0], joined.faces[1]);
    assert.deepEqual(joined.failures, []);
    assert.equal((await e.opt('help', {})).opt_ops.opt_join.includes('合并'), true);
    evidence.opt = { analyzed, dry, joined };
  }

  const failedJob = e.job.start({ script: 'raise ValueError("PROTOCOL_JOB_EXCEPTION")', engine: 'none', outdir: out });
  const failed = await e.job.wait(failedJob.runId, 60000);
  assert.equal(failed.status, 'failed');
  assert.notEqual(failed.exitCode, 0);
  assert.match(failed.stderrTail, /ValueError: PROTOCOL_JOB_EXCEPTION/);
  assert.equal(e.job.status(failedJob.id).status, 'failed');
  assert.equal(e.job.collect(failedJob.runId).id, failedJob.id);
  evidence.failedJob = failed;
  const failedRun = await e.headless({ script: 'raise RuntimeError("PROTOCOL_HEADLESS_EXCEPTION")', engine: 'none', outdir: out });
  assert.equal(failedRun.ok, false);
  assert.notEqual(failedRun.exitCode, 0);
  assert.match(failedRun.stderr, /PROTOCOL_HEADLESS_EXCEPTION/);
  evidence.failedHeadless = failedRun;

  const runId = 'run-owned-' + Date.now();
  const live = e.job.start({ script: 'import time\ntime.sleep(5)\nprint("HEADLESS {\\"ok\\":true}")', runId, engine: 'none', outdir: out });
  assert.throws(() => e.job.start({ script: 'pass', runId, engine: 'none', outdir: out }), err => err.code === 'RUN_ID_CONFLICT');
  assert.equal(e.job.status(runId).id, live.id);
  assert.equal(e.job.kill(runId).status, 'killed');
  assert.equal((await e.job.wait(runId, 60000)).status, 'killed');
  assert.notEqual(live.id, failedJob.id);
  assert.notEqual(live.runId, failedJob.runId);
  evidence.killedAlias = e.job.collect(runId);

  const good = e.job.start({ script: 'print("HEADLESS {\\"ok\\":true,\\"answer\\":42}")', engine: 'none', outdir: out });
  assert.equal((await e.job.wait(good.id, 60000)).result.answer, 42);
  const promoted = await e.headless({ script: 'print("HEADLESS {\\"ok\\":true,\\"promoted\\":true}")', engine: 'none', asJob: true, outdir: out });
  assert.equal(promoted.ok, true);
  assert.equal((await e.job.wait(promoted.runId, 60000)).result.promoted, true);
  evidence.promoted = e.job.status(promoted.runId);
  const restored = createEngine();
  try {
    assert.equal(restored.job.status(good.runId).id, good.id);
    assert.equal(restored.job.status(good.runId).status, 'done');
    assert.throws(() => restored.job.start({ script: 'pass', runId: good.runId, engine: 'none', outdir: out }), err => err.code === 'RUN_ID_CONFLICT');
  } finally { await restored.stop(); }
  evidence.ok = true;
} finally {
  await runtime.stop();
  for (const socket of sockets) socket.destroy();
  await new Promise(resolve => addonWire.close(resolve));
  fs.writeFileSync(path.join(out, 'protocol-regression.json'), JSON.stringify(evidence, null, 2));
}
console.log(JSON.stringify({ ok: true, evidence: path.join(out, 'protocol-regression.json') }));
