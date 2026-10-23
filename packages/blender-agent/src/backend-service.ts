// An authenticated, client-owned envelope around the maintained HTTP runtime.
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
  let persistent = process.env.BLENDER_AGENT_PERSISTENT === '1';
  const ownerPid = Number(process.env.BLENDER_AGENT_OWNER_PID);
  const clients = new Map<string, number>();
  let stopping = false, hadClient = false;
  const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
  const reapClients = () => { for (const [id, pid] of clients) if (!alive(pid)) clients.delete(id); };
  const state: State = { pid: process.pid, token, instance, fingerprint: manifest().fingerprint, port: opts.port,
    startedAt: new Date().toISOString(), workdir: opts.workdir, blender: opts.blender, addonPort: opts.addonPort, workerPort: opts.workerPort, persistent };
  const destination = statePath(opts);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const writeState = () => {
    const temp = destination + '.' + process.pid + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(state), { mode: 0o600 }); fs.renameSync(temp, destination);
  };
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
        res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, adapter: 'blender-agent', ...identity, clients: clients.size })); return true;
      }
      if (url.pathname === '/_adapter/clients' && req.method === 'POST') {
        void (async () => {
          try {
            let text = '';
            for await (const part of req) { text += part.toString(); if (text.length > 4096) throw new Error('Client registration is too large'); }
            const body = JSON.parse(text);
            if (typeof body.id !== 'string' || !body.id || body.id.length > 100 || !['attach', 'detach'].includes(body.op)) throw new Error('Invalid client registration');
            if (stopping) { res.writeHead(503, { 'content-type': 'application/json' }); res.end('{"ok":false,"error":"backend-stopping"}'); return; }
            reapClients();
            if (body.op === 'attach') {
              if (!Number.isSafeInteger(body.pid) || body.pid < 1 || !alive(body.pid)) throw new Error('Client process is not alive');
              clients.set(body.id, body.pid); hadClient = true;
              // Explicit backend start may promote an already-running MCP
              // service without destroying its live Blender scenes.
              if (body.persistent === true && !persistent) { persistent = true; state.persistent = true; writeState(); }
            } else clients.delete(body.id);
            const stop = !persistent && hadClient && clients.size === 0;
            res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, clients: clients.size, persistent, stopping: stop }));
            if (stop) { stopping = true; setImmediate(() => { void shutdown(); }); }
          } catch (e) { res.writeHead(400, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) })); }
        })();
        return true;
      }
      if (url.pathname === '/_adapter/shutdown' && req.method === 'POST') {
        reapClients();
        const clientId = String(req.headers['x-blender-agent-client'] || '');
        const otherClients = [...clients.keys()].filter(id => id !== clientId).length;
        if (otherClients) {
          res.writeHead(409, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'backend-in-use', otherClients })); return true;
        }
        stopping = true;
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
  writeState();
  let shuttingDown = false;
  async function shutdown() {
    if (shuttingDown) return; stopping = true; shuttingDown = true;
    cleanup();
    const timer = setTimeout(() => process.exit(0), 1000); timer.unref();
    await runtime.stop(); process.exit(0);
  }
  process.once('SIGINT', () => { void shutdown(); }); process.once('SIGTERM', () => { void shutdown(); });
  if (!persistent && ownerPid > 0) {
    // A second host may outlive the original launcher. Dead hosts are reaped,
    // while any registered live client keeps its scenes and jobs available.
    setInterval(() => {
      if (persistent) return;
      reapClients();
      if (clients.size === 0 && (hadClient || !alive(ownerPid))) void shutdown();
    }, 1000).unref();
  }
}
