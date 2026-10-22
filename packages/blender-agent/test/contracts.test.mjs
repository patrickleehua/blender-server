import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Bridge, parseResponse, tools } from '../dist/core.js';
import { Backend, portOccupied } from '../dist/backend.js';
import { manifest, options, statePath } from '../dist/config.js';
import { planHeadlessTarget } from '../contracts/plan-routing.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'dist/cli.js');
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
async function freePort() {
  const server = net.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port;
}
async function fixture(handler) {
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'blender agent 中文 '));
  const port = await freePort(), addonPort = await freePort(), workerPort = await freePort();
  const opts = options({ port, addonPort, workerPort, workdir });
  const state = { pid: process.pid, port, token: 'fixture-secret-token', fingerprint: manifest().fingerprint,
    startedAt: new Date().toISOString(), workdir, addonPort, workerPort, persistent: true, instance: 'test-instance' };
  fs.mkdirSync(path.dirname(statePath(opts)), { recursive: true }); fs.writeFileSync(statePath(opts), JSON.stringify(state));
  const server = http.createServer((req, res) => {
    if (req.url === '/_adapter/identity') { const { token, ...identity } = state; res.end(JSON.stringify({ ok: true, adapter: 'blender-agent', ...identity })); return; }
    assert.equal(req.headers['x-blender-agent-token'], state.token);
    handler(req, res);
  });
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  return { opts, state, server, async close() { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); fs.rmSync(workdir, { recursive: true, force: true }); } };
}

test('15 standard JSON schemas; specific plan prefixes win before general prefixes', () => {
  assert.equal(tools.length, 15); assert.equal(new Set(tools.map(t => t.name)).size, 15);
  assert.ok(tools.every(t => t.inputSchema.type === 'object'));
  assert.equal(planHeadlessTarget('qc_render_views').api, 'dsh_qc_render_api');
  assert.equal(planHeadlessTarget('qc_compare').api, 'dsh_qc_api');
  assert.equal(planHeadlessTarget('generator_run').sub, 'run');
  assert.equal(planHeadlessTarget('gui_open'), null);
  assert.deepEqual(parseResponse('{"heartbeat":true}\n{"ok":true,"result":42}\n'), { ok: true, result: 42 });
  assert.throws(() => parseResponse('{"heartbeat":true}\n'), /final NDJSON/);
});

test('an unrelated open port is refused without sending a tool operation or killing it', async () => {
  let calls = 0;
  const server = http.createServer((_req, res) => { calls++; res.end('{"ok":true}'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'blender-port-'));
  const bridge = new Bridge({ port: server.address().port, addonPort: await freePort(), workerPort: await freePort(), workdir });
  try {
    const result = await bridge.call('blender_rt_do', { code: 'MUST_NOT_EXECUTE', see: false });
    assert.equal(result.isError, true); assert.equal(result.structuredContent.code, 'PORT_OCCUPIED');
    for (const name of ['blender_rt_worker', 'blender_rt_job', 'blender_rt_txn', 'blender_rt_preset', 'blender_rt_perf', 'blender_rt_opt', 'blender_viewport', 'blender_rt_loop']) {
      const invalid = await bridge.call(name, { op: 'this-operation-does-not-exist' });
      assert.equal(invalid.isError, true); assert.equal(invalid.structuredContent.code, 'INVALID_ARGUMENTS');
    }
    assert.equal(calls, 0); assert.equal(await portOccupied(server.address().port), true);
  } finally { await new Promise(resolve => server.close(resolve)); fs.rmSync(workdir, { recursive: true, force: true }); }
});

test('timeout covers streaming response body; cancellation and disconnect never replay a write', async () => {
  let calls = 0;
  const f = await fixture((req, res) => {
    calls++;
    if (req.url === '/stream') { res.writeHead(200); res.write('{"heartbeat":true}\n'); }
    else req.socket.destroy();
  });
  const backend = new Backend(f.opts);
  try {
    await assert.rejects(backend.request('/stream', { code: 'one write' }, undefined, 50), e => e.code === 'TIMEOUT');
    assert.equal(calls, 1);
    await assert.rejects(backend.request('/write', { code: 'one write' }), e => e.code === 'TRANSPORT_ERROR');
    assert.equal(calls, 2);
    const cancelled = new AbortController(); cancelled.abort();
    await assert.rejects(backend.request('/write', {}, cancelled.signal), e => e.code === 'CANCELLED');
    assert.equal(calls, 2);
  } finally { await f.close(); }
});

test('official MCP client receives native image content and nested execution failure', async () => {
  const f = await fixture(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    const args = JSON.parse(body);
    if (args.op === 'see') res.end(JSON.stringify({ ok: true, result: { ok: true, png_b64: png, width: 1, height: 1 } }));
    else if (args.op === 'exec') res.end(JSON.stringify({ ok: true, result: { ok: true, result: { ok: false, error: 'semantic failure' } } }));
    else res.end(JSON.stringify({ ok: true }));
  });
  const transport = new StdioClientTransport({ command: process.execPath, args: [cli, 'mcp', '--no-auto-start', '--port', String(f.opts.port), '--addon-port', String(f.opts.addonPort), '--worker-port', String(f.opts.workerPort), '--workdir', f.opts.workdir], stderr: 'pipe' });
  const client = new Client({ name: 'contract-test', version: '1.0.0' });
  try {
    await client.connect(transport);
    assert.equal((await client.listTools()).tools.length, 15);
    const seen = await client.callTool({ name: 'blender_rt_worker', arguments: { op: 'see' } });
    const img = seen.content.find(x => x.type === 'image');
    assert.equal(img.mimeType, 'image/png'); assert.equal(img.data, png);
    assert.ok(!seen.content.find(x => x.type === 'text').text.includes('png_b64'));
    const failure = await client.callTool({ name: 'blender_rt_worker', arguments: { op: 'exec', code: 'pass' } });
    assert.equal(failure.isError, true);
    const malformed = await client.callTool({ name: 'blender_rt_cmd', arguments: { name: 123 } });
    assert.equal(malformed.isError, true); assert.equal(malformed.structuredContent.code, 'INVALID_ARGUMENTS');
  } finally { await client.close(); await f.close(); }
});

test('real isolated engine catalog survives Unicode paths; owned backend and state clean up', { timeout: 45000 }, async () => {
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'blender agent 中文 '));
  const opts = options({ port: await freePort(), addonPort: await freePort(), workerPort: await freePort(), workdir });
  const bridge = new Bridge(opts);
  try {
    const result = await bridge.call('blender_rt_plan', { op: 'catalog', args: { full: true } });
    assert.equal(result.isError, false);
    const catalog = result.structuredContent.result;
    assert.equal(catalog.families.length, 33); assert.equal(catalog.ops_count, 217);
    assert.equal(fs.existsSync(statePath(opts)), true);
    const unauthenticated = await fetch(`http://127.0.0.1:${opts.port}/health`); assert.equal(unauthenticated.status, 401);
    const doctor = await bridge.call('blender_viewport', { op: 'doctor' });
    assert.equal(doctor.structuredContent.kind, 'blender-unreachable'); assert.equal(doctor.isError, true);
  } finally {
    await bridge.dispose();
    assert.equal(await portOccupied(opts.port), false); assert.equal(fs.existsSync(statePath(opts)), false);
    fs.rmSync(workdir, { recursive: true, force: true });
  }
});
