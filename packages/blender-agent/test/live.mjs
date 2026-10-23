// Real Blender and real MCP stdio acceptance. Run explicitly with an executable.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { randomInt } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { portOccupied } from '../dist/backend.js';

const blender = process.env.BLENDER_AGENT_TEST_EXE;
if (!blender || !fs.existsSync(blender)) throw new Error('Set BLENDER_AGENT_TEST_EXE to a real Blender executable');
const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/cli.js');
const assigned = new Set();
async function port() {
  for (let i = 0; i < 30; i++) {
    const candidate = randomInt(20000, 45000); if (assigned.has(candidate)) continue;
    const s = net.createServer();
    try {
      await new Promise((resolve, reject) => { s.once('error', reject); s.listen(candidate, '127.0.0.1', resolve); });
      assigned.add(candidate); return candidate;
    } catch (e) { if (!['EADDRINUSE', 'EACCES'].includes(e.code)) throw e; }
    finally { await new Promise(r => s.close(r)); }
  }
  throw new Error('Could not allocate a non-ephemeral listener port');
}

test('real MCP maintains one scene across capabilities, resolves blend-relative files, returns real PNG and cleans background children', { timeout: 120000 }, async () => {
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'blender MCP 中文 '));
  const httpPort = await port(), addonPort = await port(), workerPort = await port();
  const args = [cli, 'mcp', '--port', String(httpPort), '--addon-port', String(addonPort), '--worker-port', String(workerPort), '--workdir', workdir, '--blender', blender];
  const client = new Client({ name: 'real-blender-acceptance', version: '1.0.0' });
  const transport = new StdioClientTransport({ command: process.execPath, args, stderr: 'pipe' });
  const call = async (name, args) => {
    const r = await client.callTool({ name, arguments: args }, undefined, { timeout: 90000 });
    assert.equal(r.isError, false, r.content.filter(x => x.type === 'text').map(x => x.text).join('\n'));
    return r;
  };
  let workerPid, backendPid;
  try {
    await client.connect(transport);
    assert.equal((await client.listTools()).tools.length, 15);
    const doctor = await client.callTool({ name: 'blender_viewport', arguments: { op: 'doctor' } });
    assert.equal(doctor.structuredContent.kind, 'blender-unreachable', JSON.stringify(doctor.structuredContent)); assert.equal(doctor.isError, true);
    await call('blender_rt_do', { session: 'proof', see: false, code: 'import bpy\nbpy.ops.wm.read_factory_settings(use_empty=True)\nbpy.ops.mesh.primitive_cube_add(size=2)\nbpy.context.object.name="PortableProof"\nK.marker="scene-survives"' });
    backendPid = JSON.parse(fs.readFileSync(path.join(workdir, '.blender-agent', `backend-${httpPort}.json`), 'utf8')).pid;
    const status = await call('blender_rt_worker', { op: 'status', name: 'proof' }); workerPid = status.structuredContent.result.pid;
    const audit = await call('blender_rt_plan', { session: 'proof', op: 'audit_mesh', args: { objects: ['PortableProof'] } });
    assert.ok(audit.structuredContent.result);
    const still = await call('blender_rt_worker', { op: 'status', name: 'proof' }); assert.equal(still.structuredContent.result.pid, workerPid);
    await call('blender_rt_do', { session: 'proof', see: false, code: `import bpy\nassert "PortableProof" in bpy.data.objects\nassert K.marker=="scene-survives"\nbpy.ops.wm.save_as_mainfile(filepath=${JSON.stringify(path.join(workdir, 'saved.blend'))})` });
    fs.writeFileSync(path.join(workdir, 'relative-script.py'), 'import os\nassert os.path.basename(__file__)=="relative-script.py"\nassert "PortableProof" in bpy.data.objects\nK.relative_script_ok=True\n');
    await call('blender_rt_do', { session: 'proof', file: 'relative-script.py', see: false });
    await call('blender_rt_do', { session: 'proof', see: false, code: 'assert K.relative_script_ok' });
    const seen = await call('blender_rt_see', { session: 'proof', view_size: '320x180' });
    const image = seen.content.find(x => x.type === 'image'); assert.ok(image); assert.equal(image.mimeType, 'image/png');
    const bytes = Buffer.from(image.data, 'base64'); assert.equal(bytes.readUInt32BE(16), 320); assert.equal(bytes.readUInt32BE(20), 180);
    fs.writeFileSync(path.join(workdir, 'proof.png'), bytes);
    const broken = await client.callTool({ name: 'blender_rt_do', arguments: { session: 'proof', see: false, code: 'raise RuntimeError("expected regression failure")' } });
    assert.equal(broken.isError, true);
  } finally {
    await client.close();
    const until = Date.now() + 5000;
    while (Date.now() < until) {
      let alive = false; if (backendPid) { try { process.kill(backendPid, 0); alive = true; } catch {} }
      if (!alive && !await portOccupied(httpPort)) break;
      await new Promise(r => setTimeout(r, 50));
    }
    assert.equal(await portOccupied(httpPort), false);
    if (backendPid) assert.throws(() => process.kill(backendPid, 0));
    if (workerPid) { assert.throws(() => process.kill(workerPid, 0)); }
    fs.rmSync(workdir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

test('persistent CLI lease identity is explicit and protects other sessions', { timeout: 30000 }, async () => {
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'blender CLI lease '));
  const httpPort = await port(), addonPort = await port(), workerPort = await port();
  const flags = ['--port', String(httpPort), '--addon-port', String(addonPort), '--worker-port', String(workerPort), '--workdir', workdir, '--blender', blender];
  const cliCall = (args) => {
    const p = spawnSync(process.execPath, [cli, ...args, ...flags], { encoding: 'utf8', windowsHide: true });
    return { exit: p.status, result: JSON.parse(p.stdout) };
  };
  try {
    assert.equal(cliCall(['backend', 'start']).exit, 0);
    const noHolder = cliCall(['call', 'blender_viewport', '--json', '{"op":"lease"}']);
    assert.equal(noHolder.exit, 1); assert.equal(noHolder.result.structuredContent.code, 'EXPLICIT_HOLDER_REQUIRED');
    assert.equal(cliCall(['call', 'blender_viewport', '--holder', 'session-A', '--json', '{"op":"lease"}']).exit, 0);
    const denied = cliCall(['call', 'blender_rt_preset', '--holder', 'session-B', '--json', '{"op":"save","name":"denied","data":"{\\"x\\":1}"}']);
    assert.equal(denied.exit, 1); assert.equal(denied.result.structuredContent.httpStatus, 409);
    const released = cliCall(['call', 'blender_viewport', '--holder', 'session-A', '--json', '{"op":"release"}']);
    assert.equal(released.exit, 0); assert.equal(released.result.structuredContent.released, 'session-A');
  } finally {
    cliCall(['backend', 'stop']); fs.rmSync(workdir, { recursive: true, force: true });
  }
});
