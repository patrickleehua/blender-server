// A thin authenticated envelope around the unchanged upstream HTTP server.
// It prevents port takeover and adds an identity independent of health/doctor.
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { timingSafeEqual } from 'node:crypto';
import { ASSETS, manifest, options, statePath, type State } from './config.js';

export async function backendService(): Promise<void> {
  const opts = options(JSON.parse(process.env.BLENDER_AGENT_OPTIONS || '{}'));
  const token = process.env.BLENDER_AGENT_TOKEN;
  const instance = process.env.BLENDER_AGENT_INSTANCE;
  if (!token || !instance) throw new Error('Internal backend service requires launch credentials');
  const persistent = process.env.BLENDER_AGENT_PERSISTENT === '1';
  const ownerPid = Number(process.env.BLENDER_AGENT_OWNER_PID);
  const state: State = { pid: process.pid, token, instance, fingerprint: manifest().fingerprint, port: opts.port,
    startedAt: new Date().toISOString(), workdir: opts.workdir, blender: opts.blender, addonPort: opts.addonPort, workerPort: opts.workerPort, persistent };
  const destination = statePath(opts);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const configPath = path.join(path.dirname(destination), `config-${opts.port}-${instance}.json`);
  fs.writeFileSync(configPath, JSON.stringify({ workDir: opts.workdir, httpPort: opts.port, addonHost: '127.0.0.1', addonPort: opts.addonPort, workerPort: opts.workerPort, ...(opts.blender ? { blenderExe: opts.blender } : {}) }), { mode: 0o600 });
  // Never discover settings from an old host's ~/.dsh configuration.
  process.env.DSH_BLENDER_CONFIG = configPath;
  const children = new Set<ChildProcess>();
  const cleanup = () => {
    for (const child of children) { try { child.kill('SIGKILL'); } catch {} }
    try { if (JSON.parse(fs.readFileSync(destination, 'utf8')).instance === instance) fs.unlinkSync(destination); } catch {}
    try { fs.unlinkSync(configPath); } catch {}
  };
  process.on('exit', cleanup);
  process.prependListener('SIGTERM', cleanup);
  process.prependListener('SIGINT', cleanup);
  const middleware = (req: IncomingMessage, res: ServerResponse): boolean => {
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      const incoming = String(req.headers['x-blender-agent-token'] || '');
      const a = Buffer.from(incoming), b = Buffer.from(token);
      const valid = a.length === b.length && timingSafeEqual(a, b);
      if (!valid && !(req.method === 'POST' && url.pathname === '/host/selection')) {
        res.writeHead(401, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'adapter-auth-required' })); return true;
      }
      if (url.pathname === '/_adapter/identity') {
        const { token: _, ...identity } = state;
        res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, adapter: 'blender-agent', ...identity })); return true;
      }
      if (url.pathname === '/_adapter/shutdown' && req.method === 'POST') {
        res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true,"stopping":true}');
        setImmediate(() => { void shutdown(); }); return true;
      }
      return false;
  };
  process.env.DSH_BLENDER_HTTP_PORT = String(opts.port);
  process.env.DSH_BLENDER_ADDON_PORT = String(opts.addonPort);
  process.env.DSH_BLENDER_ADDON_HOST = '127.0.0.1';
  process.env.DSH_BLENDER_WORKER_PORT = String(opts.workerPort);
  process.env.DSH_BLENDER_WORKDIR = opts.workdir;
  if (opts.blender) process.env.DSH_BLENDER_EXE = opts.blender;
  const { startRuntimeServer } = await import(pathToFileURL(path.join(ASSETS, 'runtime/server.mjs')).href);
  const runtime = await startRuntimeServer({ port: opts.port, middleware, onChild(child: ChildProcess) {
    children.add(child); child.once('exit', () => children.delete(child));
  } });
  const temp = destination + '.' + process.pid + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(state), { mode: 0o600 }); fs.renameSync(temp, destination);
  let stopping = false;
  async function shutdown() {
    if (stopping) return; stopping = true;
    cleanup();
    const timer = setTimeout(() => process.exit(0), 1000); timer.unref();
    await runtime.stop(); process.exit(0);
  }
  process.once('SIGINT', () => { void shutdown(); }); process.once('SIGTERM', () => { void shutdown(); });
  if (!persistent && ownerPid > 0) {
    setInterval(() => { try { process.kill(ownerPid, 0); } catch { process.emit('SIGTERM'); } }, 1000).unref();
  }
}
