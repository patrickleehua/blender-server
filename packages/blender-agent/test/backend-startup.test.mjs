// Real backend services; no Blender or GUI is launched by these startup checks.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { setTimeout as pause } from 'node:timers/promises';
import { Backend, portOccupied } from '../dist/backend.js';
import { options, manifest } from '../dist/config.js';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backendUrl = pathToFileURL(path.join(packageRoot, 'dist/backend.js')).href;
const configUrl = pathToFileURL(path.join(packageRoot, 'dist/config.js')).href;
const cli = path.join(packageRoot, 'dist/cli.js');
const output = process.env.BLENDER_AGENT_STARTUP_OUT;
async function ports() {
  const servers = [];
  try {
    for (let i = 0; i < 3; i++) {
      const server = net.createServer(); servers.push(server);
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    }
    return servers.map(server => server.address().port);
  } finally { await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve)))); }
}
async function fixture(label) {
  if (output) fs.mkdirSync(output, { recursive: true });
  const workdir = fs.mkdtempSync(path.join(output ? path.resolve(output) : os.tmpdir(), label + ' 中文 '));
  const [port, addonPort, workerPort] = await ports();
  const opts = options({ workdir, port, addonPort, workerPort });
  return { opts, record(value) {
    if (output) fs.writeFileSync(path.join(workdir, 'result.json'), JSON.stringify({ fingerprint: manifest().fingerprint, ...value }, null, 2));
  }, async clean() {
    for (let i = 0; i < 80 && await portOccupied(port); i++) await pause(75);
    assert.equal(await portOccupied(port), false, 'Audit-owned backend survived cleanup');
    if (!output) fs.rmSync(workdir, { recursive: true, force: true });
  } };
}
function child(code, opts, ipc = false) {
  return spawn(process.execPath, ['--input-type=module', '-e', code], {
    windowsHide: true, stdio: ipc ? ['ignore', 'pipe', 'pipe', 'ipc'] : ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, STARTUP_TEST_OPTIONS: JSON.stringify(opts) },
  });
}
const imports = `import {Backend} from ${JSON.stringify(backendUrl)};import {options} from ${JSON.stringify(configUrl)};const backend=new Backend(options(JSON.parse(process.env.STARTUP_TEST_OPTIONS)));`;
async function message(host) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Startup test host did not respond')), 12000);
    host.once('message', value => { clearTimeout(timer); resolve(value); });
    host.once('error', error => { clearTimeout(timer); reject(error); });
  });
}
async function exited(host, timeout = 12000) {
  if (host.exitCode !== null) return host.exitCode;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { host.kill('SIGKILL'); reject(new Error('Host did not exit after completed startup/dispose')); }, timeout);
    host.once('exit', code => { clearTimeout(timer); resolve(code); });
  });
}

test('simultaneous Backend instances adopt one verified service', { timeout: 20000 }, async () => {
  const f = await fixture('same-process');
  const a = new Backend(f.opts), b = new Backend(f.opts);
  try {
    const [first, second] = await Promise.all([a.ensure(), b.ensure()]);
    assert.equal(first.pid, second.pid);
    assert.equal(first.instance, second.instance);
    f.record({ ok: true, pid: first.pid, instance: first.instance });
  } finally { await Promise.allSettled([a.dispose(), b.dispose()]); await f.clean(); }
});

test('independent hosts starting together attach to the same service', { timeout: 25000 }, async () => {
  const f = await fixture('two-hosts');
  const code = imports + `process.send({ready:true});process.on('message',async command=>{if(command==='start'){try{const state=await backend.ensure();process.send({ok:true,pid:state.pid,instance:state.instance});}catch(error){process.send({ok:false,error:error.code});}}else if(command==='close'){await backend.dispose();process.exit(0);}});`;
  const hosts = [child(code, f.opts, true), child(code, f.opts, true)];
  try {
    await Promise.all(hosts.map(message));
    const results = hosts.map(message); hosts.forEach(host => host.send('start'));
    const [a, b] = await Promise.all(results);
    assert.equal(a.ok, true, JSON.stringify(a)); assert.equal(b.ok, true, JSON.stringify(b));
    assert.equal(a.pid, b.pid); assert.equal(a.instance, b.instance);
    f.record({ ok: true, results: [a, b] });
  } finally {
    hosts.forEach(host => { if (host.connected) host.send('close'); });
    await Promise.all(hosts.map(host => exited(host))); await f.clean();
  }
});

test('CLI backend start promotes the current service past last-client reaping', { timeout: 20000 }, async () => {
  const f = await fixture('persistent-promotion'), a = new Backend(f.opts);
  try {
    const initial = await a.ensure(); assert.equal(initial.persistent, false);
    const run = spawnSync(process.execPath, [cli, 'backend', 'start', '--port', String(f.opts.port), '--addon-port', String(f.opts.addonPort), '--worker-port', String(f.opts.workerPort), '--workdir', f.opts.workdir], { windowsHide: true, encoding: 'utf8', timeout: 10000 });
    assert.ifError(run.error); assert.equal(run.status, 0, run.stderr);
    const promoted = JSON.parse(run.stdout);
    assert.equal(promoted.ok, true); assert.equal(promoted.persistent, true); assert.equal(promoted.pid, initial.pid);
    await a.dispose(); await pause(1600);
    const kept = await a.identity();
    assert.ok(kept, 'Promoted backend was reaped after the last client left');
    assert.equal(kept.pid, initial.pid); assert.equal(kept.persistent, true);
    f.record({ ok: true, promoted, keptPid: kept.pid });
  } finally { await a.dispose(); await a.stop(); await f.clean(); }
});

test('registration rejection releases the launched-child handle so its host exits', { timeout: 20000 }, async () => {
  const f = await fixture('attach-rejection');
  const code = imports + `const realFetch=globalThis.fetch;globalThis.fetch=(url,...args)=>String(url).endsWith('/_adapter/clients')?Promise.resolve(new Response('{}',{status:503})):realFetch(url,...args);try{await backend.ensure();throw Error('Registration should fail');}catch(error){if(error.code!=='BACKEND_ATTACH_FAILED')throw error;}await backend.dispose();console.log('DISPOSED');`;
  const host = child(code, f.opts); let stdout = '', stderr = '';
  host.stdout.on('data', chunk => stdout += chunk); host.stderr.on('data', chunk => stderr += chunk);
  try {
    assert.equal(await exited(host, 6000), 0, stderr);
    assert.match(stdout, /DISPOSED/);
    f.record({ ok: true, exit: host.exitCode, stdout, fault: 'HTTP 503 injected only at registration; real service/identity' });
  } finally { if (host.exitCode === null) host.kill('SIGKILL'); await f.clean(); }
});
