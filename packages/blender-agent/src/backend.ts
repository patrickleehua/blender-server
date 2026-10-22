import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { BridgeError, manifest, PACKAGE_ROOT, statePath, type Options, type State, publicState } from './config.js';

export async function portOccupied(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    const finish = (value: boolean) => { socket.destroy(); resolve(value); };
    socket.setTimeout(800, () => finish(true));
    socket.once('connect', () => finish(true));
    socket.once('error', (e: NodeJS.ErrnoException) => finish(e.code !== 'ECONNREFUSED'));
  });
}
export class Backend {
  private child?: ChildProcess;
  private state?: State;
  private starting?: Promise<State>;
  private readonly fingerprint = manifest().fingerprint;
  constructor(readonly opts: Options) {}
  async identity(allowStale = false): Promise<State | null> {
    if (!await portOccupied(this.opts.port)) return null;
    let state: State;
    try { state = JSON.parse(fs.readFileSync(statePath(this.opts), 'utf8')); }
    catch { throw new BridgeError('PORT_OCCUPIED', `Port ${this.opts.port} belongs to another service or workdir; choose another --port`); }
    try {
      const response = await fetch(`http://127.0.0.1:${this.opts.port}/_adapter/identity`, { headers: { 'x-blender-agent-token': state.token }, signal: AbortSignal.timeout(2000) });
      const actual: any = await response.json();
      if (!response.ok || actual.adapter !== 'blender-agent' || actual.pid !== state.pid || actual.instance !== state.instance || actual.fingerprint !== state.fingerprint || (!allowStale && actual.fingerprint !== this.fingerprint) || actual.workdir !== this.opts.workdir || actual.addonPort !== this.opts.addonPort || actual.workerPort !== this.opts.workerPort || (this.opts.blender && actual.blender !== this.opts.blender)) {
        throw new Error('Backend identity, asset version or configuration mismatch');
      }
      this.state = state;
      return state;
    } catch (e) { throw new BridgeError('BACKEND_IDENTITY_MISMATCH', `Refusing port ${this.opts.port}: ${e instanceof Error ? e.message : String(e)}`); }
  }
  async ensure(persistent = false): Promise<State> {
    if (this.starting) return this.starting;
    this.starting = this.start(persistent);
    try { return await this.starting; } finally { this.starting = undefined; }
  }
  private async start(persistent: boolean): Promise<State> {
    const existing = await this.identity();
    if (existing) return existing;
    if (!this.opts.autoStart) throw new BridgeError('BACKEND_UNAVAILABLE', 'Backend is not running; use backend start');
    fs.mkdirSync(path.dirname(statePath(this.opts)), { recursive: true });
    const logPath = path.join(path.dirname(statePath(this.opts)), `backend-${this.opts.port}.log`);
    const log = fs.openSync(logPath, 'a');
    const env = { ...process.env, BLENDER_AGENT_OPTIONS: JSON.stringify(this.opts), BLENDER_AGENT_TOKEN: randomBytes(32).toString('hex'),
      BLENDER_AGENT_INSTANCE: randomUUID(), BLENDER_AGENT_PERSISTENT: persistent ? '1' : '0', BLENDER_AGENT_OWNER_PID: String(process.pid) };
    for (const key of Object.keys(env)) if (key.startsWith('DSH_BLENDER_') || key.startsWith('BLENDER_USER_')) delete (env as Record<string, unknown>)[key];
    const child = spawn(process.execPath, [path.join(PACKAGE_ROOT, 'dist/cli.js'), '__backend-service'], {
      env, cwd: this.opts.workdir, detached: persistent, windowsHide: true, stdio: ['ignore', log, log],
    });
    fs.closeSync(log);
    this.child = child;
    let launchError: Error | undefined;
    child.once('error', e => { launchError = e; });
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      if (launchError || child.exitCode !== null) throw new BridgeError('BACKEND_START_FAILED', `Backend exited during startup; inspect ${logPath}`, { cause: launchError?.message, exitCode: child.exitCode });
      if (await portOccupied(this.opts.port)) {
        // listen() can complete just before the service writes its identity file.
        // Wait for our own instance marker instead of misclassifying that gap.
        let ready = false;
        try { const marker = JSON.parse(fs.readFileSync(statePath(this.opts), 'utf8')); ready = marker.instance === env.BLENDER_AGENT_INSTANCE && marker.pid === child.pid; } catch {}
        if (ready) {
          const state = await this.identity();
          if (state) {
            if (persistent) { child.unref(); this.child = undefined; }
            return state;
          }
        }
      }
      await delay(100);
    }
    child.kill(); this.child = undefined;
    throw new BridgeError('BACKEND_START_TIMEOUT', `Backend did not become ready; inspect ${logPath}`);
  }
  async request(route: string, body?: unknown, signal?: AbortSignal, timeoutMs = this.opts.timeoutMs): Promise<{ response: Response; bytes: Buffer }> {
    if (signal?.aborted) throw new BridgeError('CANCELLED', 'Request cancelled before dispatch');
    await this.ensure();
    // Identity is checked before each call. A failed request is never replayed.
    const state = await this.identity();
    if (!state) throw new BridgeError('BACKEND_UNAVAILABLE', 'Backend disappeared before request; operation was not sent');
    const deadline = AbortSignal.timeout(timeoutMs);
    const combined = signal ? AbortSignal.any([deadline, signal]) : deadline;
    try {
      const response = await fetch(`http://127.0.0.1:${this.opts.port}${route}`, {
        method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json', 'x-blender-agent-token': state.token },
        body: body === undefined ? undefined : JSON.stringify(body), signal: combined,
      });
      const bytes = Buffer.from(await response.arrayBuffer());
      return { response, bytes };
    } catch (e) {
      if (signal?.aborted) throw new BridgeError('CANCELLED', 'Request cancelled. Blender work already accepted may still run; inspect job/worker state before retrying.');
      if (deadline.aborted) throw new BridgeError('TIMEOUT', 'Request timed out. Execution status is unknown; inspect job/worker state before retrying.');
      throw new BridgeError('TRANSPORT_ERROR', 'Backend connection failed. Execution status is unknown; the operation was not replayed.', { cause: e instanceof Error ? e.message : String(e) });
    }
  }
  async status() { const state = await this.identity(); return state ? { ok: true, running: true, ...publicState(state) } : { ok: true, running: false, port: this.opts.port, workdir: this.opts.workdir }; }
  async stop(): Promise<void> {
    const state = await this.identity(true);
    if (!state) return;
    await fetch(`http://127.0.0.1:${this.opts.port}/_adapter/shutdown`, { method: 'POST', headers: { 'x-blender-agent-token': state.token }, signal: AbortSignal.timeout(3000) });
    const until = Date.now() + 5000;
    while (Date.now() < until && await portOccupied(this.opts.port)) await delay(75);
    if (await portOccupied(this.opts.port)) throw new BridgeError('BACKEND_STOP_TIMEOUT', 'Backend did not stop; no unrelated process was killed');
    // A closed port precedes process exit; Windows retains the cwd and log handles.
    while (Date.now() < until) {
      try { process.kill(state.pid, 0); } catch { break; }
      await delay(50);
    }
    this.child = undefined; this.state = undefined;
  }
  async dispose(): Promise<void> {
    if (!this.child) return;
    try { await this.stop(); }
    finally { if (this.child && this.child.exitCode === null) this.child.kill('SIGKILL'); this.child = undefined; }
  }
}
