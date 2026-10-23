// Real Blender / real stdio lifecycle regression; deliberately excluded from *.test.mjs.
// BLENDER_AGENT_TEST_EXE=<blender> node --test test/lifecycle-live.mjs
// BLENDER_AGENT_LIFECYCLE_OUT optionally retains raw calls under a chosen evidence directory.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { randomInt } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { portOccupied } from '../dist/backend.js';

const blender = process.env.BLENDER_AGENT_TEST_EXE;
if (!blender || !fs.existsSync(blender)) throw new Error('Set BLENDER_AGENT_TEST_EXE to a real Blender executable');
const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/cli.js');
const output = process.env.BLENDER_AGENT_LIFECYCLE_OUT
  ? path.resolve(process.env.BLENDER_AGENT_LIFECYCLE_OUT)
  : fs.mkdtempSync(path.join(os.tmpdir(), 'blender lifecycle evidence '));
fs.mkdirSync(output, { recursive: true });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const alive = pid => { if (!pid) return false; try { process.kill(pid, 0); return true; } catch { return false; } };

async function until(predicate, message, timeout = 10000) {
  const deadline = Date.now() + timeout;
  do { if (await predicate()) return; await pause(75); } while (Date.now() < deadline);
  assert.fail(message);
}
async function ports() {
  // Keep worker listeners outside Windows' dynamic source-port range: a free
  // ephemeral port's successor can become an outbound HTTP port before Blender
  // binds the second worker. Reserve both actual listener ports together.
  for (let attempt = 0; attempt < 20; attempt++) {
    const sockets = [];
    const bind = async port => {
      const server = net.createServer(); sockets.push(server);
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
      return server.address().port;
    };
    try {
      const http = await bind(0), addon = await bind(0), worker = await bind(randomInt(20000, 45000));
      await bind(worker + 1);
      return { http, addon, worker };
    } catch (error) { if (!['EADDRINUSE', 'EACCES'].includes(error.code)) throw error; }
    finally { await Promise.all(sockets.map(server => new Promise(resolve => server.close(() => resolve())))); }
  }
  throw new Error('Could not allocate isolated lifecycle ports');
}
async function fixture(label) {
  const dir = fs.mkdtempSync(path.join(output, label + ' '));
  const p = await ports();
  const workdir = path.join(dir, 'work 中文 空格'); fs.mkdirSync(workdir);
  const flags = ['--port', String(p.http), '--addon-port', String(p.addon), '--worker-port', String(p.worker), '--workdir', workdir, '--blender', blender];
  const events = [], children = new Set(), workerPorts = new Set();
  const record = (label, value) => {
    events.push({ label, ...value });
    fs.writeFileSync(path.join(dir, 'calls.json'), JSON.stringify(events, null, 2));
  };
  const state = () => JSON.parse(fs.readFileSync(path.join(workdir, '.blender-agent', `backend-${p.http}.json`), 'utf8'));
  const cliRun = args => {
    const result = spawnSync(process.execPath, [cli, ...args, ...flags], { encoding: 'utf8', windowsHide: true, timeout: 120000 });
    record('cli', { args, status: result.status, stdout: result.stdout, stderr: result.stderr, error: result.error?.message });
    assert.ifError(result.error);
    let parsed; try { parsed = JSON.parse(result.stdout); } catch { assert.fail('CLI stdout was not one JSON result: ' + result.stdout); }
    return { exit: result.status, result: parsed };
  };
  const connect = async name => {
    const client = new Client({ name: 'lifecycle-' + name, version: '1.0.0' });
    const transport = new StdioClientTransport({ command: process.execPath, args: [cli, 'mcp', ...flags], stderr: 'pipe' });
    const stderr = fs.createWriteStream(path.join(dir, `mcp-${name}.stderr.txt`)); transport.stderr.pipe(stderr);
    await client.connect(transport);
    const pid = transport.pid; assert.ok(pid > 0); children.add(pid);
    record('mcp-connect', { name, pid });
    return { client, transport, pid, async close() { await client.close(); stderr.end(); } };
  };
  const call = async (peer, label, name, args, error = false) => {
    const result = await peer.client.callTool({ name, arguments: args }, undefined, { timeout: 90000 });
    record(label, { name, args, result });
    assert.equal(!!result.isError, error, JSON.stringify(result));
    return result;
  };
  const worker = async (peer, name) => {
    const result = (await call(peer, 'worker-status', 'blender_rt_worker', { op: 'status', name })).structuredContent.result;
    assert.ok(result.pid > 0); children.add(result.pid); if (result.port) workerPorts.add(result.port);
    return result;
  };
  const cleanup = async () => {
    await until(async () => !await portOccupied(p.http) && [...children].every(pid => !alive(pid)), 'Owned backend/host/worker process survived final cleanup');
    for (const port of [p.worker, p.worker + 1, ...workerPorts]) assert.equal(await portOccupied(port), false, `Owned worker port ${port} was left listening`);
    record('cleanup', { ok: true, ports: p, exitedPids: [...children] });
  };
  return { dir, p, workdir, flags, state, record, cliRun, connect, call, worker, children, cleanup };
}

async function sharedMcp(abrupt) {
  const f = await fixture(abrupt ? 'mcp-killed-owner' : 'mcp-closed-owner');
  let a, b;
  try {
    a = await f.connect('A');
    await f.call(a, 'A-create', 'blender_rt_do', { session: 'owner', see: false, code: 'import bpy\nbpy.ops.mesh.primitive_cube_add()\nbpy.context.object.name="OwnerCube"\nK.owner_marker="owner"' });
    const initial = f.state(); f.children.add(initial.pid);
    const owner = await f.worker(a, 'owner');
    b = await f.connect('B');
    await f.call(b, 'B-create', 'blender_rt_do', { session: 'survivor', see: false, code: 'import bpy\nbpy.ops.mesh.primitive_cube_add()\nbpy.context.object.name="SurvivorCube"\nK.marker="must-survive-owner"' });
    const survivor = await f.worker(b, 'survivor');
    assert.notEqual(survivor.pid, owner.pid, 'Different named sessions must have independent workers');
    assert.equal(f.state().pid, initial.pid);
    const refused = f.cliRun(['backend', 'stop']);
    assert.equal(refused.exit, 1); assert.equal(refused.result.structuredContent.code, 'BACKEND_IN_USE');
    if (abrupt) {
      // Kill only the SDK-created test MCP process, never a discovered external PID.
      assert.equal(a.transport.pid, a.pid); assert.ok(f.children.has(a.pid));
      process.kill(a.pid, 'SIGKILL');
      await until(() => !alive(a.pid), 'Killed test MCP A remained alive');
      await pause(1300); // Cross the one-second dead-client reaper interval.
    } else { await a.close(); }
    assert.equal(f.state().pid, initial.pid, 'Closing A replaced the shared backend');
    assert.equal(alive(initial.pid), true); assert.equal(await portOccupied(f.p.http), true);
    const kept = await f.worker(b, 'survivor'); assert.equal(kept.pid, survivor.pid);
    await f.call(b, 'B-state-after-A-exit', 'blender_rt_do', { session: 'survivor', see: false, code: 'assert K.marker=="must-survive-owner"\nassert "SurvivorCube" in bpy.data.objects' });
    await f.call(b, 'B-error-not-success', 'blender_rt_do', { session: 'survivor', see: false, code: 'raise RuntimeError("expected-lifecycle-failure")' }, true);
    assert.equal((await f.worker(b, 'survivor')).pid, survivor.pid);
    await f.call(b, 'B-error-retains-state', 'blender_rt_do', { session: 'survivor', see: false, code: 'assert K.marker=="must-survive-owner" and "SurvivorCube" in bpy.data.objects' });
    await b.close();
    await f.cleanup();
    f.record('result', { ok: true, abrupt, sharedBackendPid: initial.pid, survivorWorkerPid: survivor.pid, ownerWorkerPid: owner.pid });
  } finally {
    if (a) await a.close().catch(() => {});
    if (b) await b.close().catch(() => {});
    // Identity-authenticated explicit cleanup is safe even after an assertion failure.
    if (await portOccupied(f.p.http)) f.cliRun(['backend', 'stop']);
  }
}

test('real two-client MCP survives creator close and last-client exit clears both named Blender workers', { timeout: 180000 }, async () => sharedMcp(false));
test('real two-client MCP survives creator SIGKILL without losing the other worker', { timeout: 180000 }, async () => sharedMcp(true));

test('real CLI rejects ephemeral sessions and missing holder before dispatch, while persistent same-holder state survives calls and errors', { timeout: 180000 }, async () => {
  const f = await fixture('persistent-cli');
  const session = 'cli-kept', holder = ['--holder', 'lifecycle-stable-holder'];
  const call = (name, args, withHolder = true) => f.cliRun(['call', name, '--json', JSON.stringify(args), ...(withHolder ? holder : [])]);
  const rejected = (result, code) => { assert.equal(result.exit, 1); assert.equal(result.result.structuredContent.code, code); };
  try {
    for (const [name, args] of [
      ['blender_rt_do', { session, see: false, code: 'raise RuntimeError("must-not-run")' }],
      ['blender_rt_do', { see: false, code: 'raise RuntimeError("implicit-must-not-run")' }],
      ['blender_rt_see', { session, view_size: '120x120' }],
      ['blender_rt_watch', { session, seconds: 0.2, fps: 1 }],
      ['blender_rt_plan', { session, op: 'audit_mesh', args: { objects: ['Cube'] } }],
    ]) {
      rejected(call(name, args), 'PERSISTENT_BACKEND_REQUIRED');
      assert.equal(await portOccupied(f.p.http), false, `${name} created an ephemeral backend`);
      assert.equal(fs.existsSync(path.join(f.workdir, '.blender-agent', `backend-${f.p.http}.json`)), false);
    }
    const start = f.cliRun(['backend', 'start']); assert.equal(start.exit, 0); assert.equal(start.result.persistent, true);
    const initial = f.state(); f.children.add(initial.pid);
    await pause(1300); // No client remains attached; persistent mode must outlive the reaper interval.
    assert.equal(alive(initial.pid), true); assert.equal(await portOccupied(f.p.http), true);
    rejected(call('blender_rt_do', { session, see: false, code: 'K.marker="wrong-holder"' }, false), 'EXPLICIT_HOLDER_REQUIRED');
    const made = call('blender_rt_do', { session, see: false, code: 'import bpy\nbpy.ops.mesh.primitive_cube_add()\nbpy.context.object.name="CliPersistentCube"\nK.marker="stable-across-cli"' }); assert.equal(made.exit, 0);
    const status = call('blender_rt_worker', { op: 'status', name: session }); assert.equal(status.exit, 0);
    const workerPid = status.result.structuredContent.result.pid; assert.ok(workerPid > 0); f.children.add(workerPid);
    const read = () => call('blender_rt_do', { session, see: false, code: 'assert K.marker=="stable-across-cli" and "CliPersistentCube" in bpy.data.objects' });
    assert.equal(read().exit, 0);
    rejected(call('blender_rt_do', { session, see: false, code: 'K.marker="must-not-change"' }, false), 'EXPLICIT_HOLDER_REQUIRED');
    rejected(call('blender_rt_worker', { op: 'stop', name: session }, false), 'EXPLICIT_HOLDER_REQUIRED');
    const broken = call('blender_rt_do', { session, see: false, code: 'raise RuntimeError("expected CLI lifecycle error")' });
    assert.equal(broken.exit, 1); assert.equal(broken.result.isError, true);
    assert.equal(read().exit, 0);
    assert.equal(call('blender_rt_worker', { op: 'status', name: session }).result.structuredContent.result.pid, workerPid);
    assert.equal(f.state().pid, initial.pid); assert.equal(await portOccupied(f.p.http), true, 'Persistent backend stopped between CLI clients');
    assert.equal(f.cliRun(['backend', 'stop']).exit, 0);
    await f.cleanup();
    f.record('result', { ok: true, persistentBackendPid: initial.pid, workerPid, holderRequired: true, rejectedImplicitCalls: 5 });
  } finally { if (await portOccupied(f.p.http)) f.cliRun(['backend', 'stop']); }
});
