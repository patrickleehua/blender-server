import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

export const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ASSETS = path.join(PACKAGE_ROOT, 'assets');
export const VERSION = '1.0.0';
export interface Options {
  port: number; workdir: string; blender?: string; addonPort: number; workerPort: number;
  timeoutMs: number; autoStart: boolean;
  holder?: string;
}
export class BridgeError extends Error {
  constructor(public code: string, message: string, public details?: unknown) { super(message); this.name = 'BridgeError'; }
}
function positive(value: unknown, fallback: number, max: number, name: string): number {
  const n = value === undefined || value === '' ? fallback : Number(value);
  if (!Number.isSafeInteger(n) || n < 1 || n > max) throw new BridgeError('INVALID_CONFIG', `${name} must be an integer between 1 and ${max}`);
  return n;
}
export function options(input: Partial<Options> = {}): Options {
  let config: Record<string, unknown> = {};
  if (process.env.DSH_BLENDER_CONFIG) {
    try { config = JSON.parse(fs.readFileSync(process.env.DSH_BLENDER_CONFIG, 'utf8')); }
    catch { throw new BridgeError('INVALID_CONFIG', 'Cannot read DSH_BLENDER_CONFIG as JSON'); }
  }
  const port = positive(input.port ?? process.env.DSH_BLENDER_HTTP_PORT ?? config.httpPort, 9877, 65535, 'port');
  const addonPort = positive(input.addonPort ?? process.env.DSH_BLENDER_ADDON_PORT ?? config.addonPort, 9876, 65535, 'addonPort');
  const workerPort = positive(input.workerPort ?? process.env.DSH_BLENDER_WORKER_PORT ?? config.workerPort, 9879, 65535, 'workerPort');
  if (new Set([port, addonPort, workerPort]).size !== 3) throw new BridgeError('INVALID_CONFIG', 'HTTP, addon and worker ports must be different');
  const blender = input.blender ?? process.env.DSH_BLENDER_EXE ?? (config.blenderExe ? String(config.blenderExe) : undefined);
  return {
    port, addonPort, workerPort,
    workdir: path.resolve(input.workdir ?? process.env.DSH_BLENDER_WORKDIR ?? String(config.workDir || path.join(os.tmpdir(), 'blender-agent'))),
    blender: blender && /[\\/]/.test(blender) && !path.isAbsolute(blender) ? path.resolve(blender) : blender,
    timeoutMs: positive(input.timeoutMs ?? process.env.BLENDER_AGENT_TIMEOUT_MS, 180000, 86400000, 'timeoutMs'),
    autoStart: input.autoStart ?? true,
    holder: input.holder ?? process.env.BLENDER_AGENT_HOLDER ?? process.env.DSH_BLENDER_HOLDER,
  };
}
export interface State { pid: number; port: number; token: string; fingerprint: string; startedAt: string; workdir: string; blender?: string; addonPort: number; workerPort: number; persistent: boolean; instance: string }
export function statePath(opts: Options): string { return path.join(opts.workdir, '.blender-agent', `backend-${opts.port}.json`); }
export function manifest(): {fingerprint: string} { return JSON.parse(fs.readFileSync(path.join(ASSETS, 'manifest.json'), 'utf8')); }
export function publicState(state: State) { const { token: _, ...rest } = state; return rest; }
