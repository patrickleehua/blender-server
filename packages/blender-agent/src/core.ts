import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { Ajv } from 'ajv';
import { Backend } from './backend.js';
import { ASSETS, BridgeError, options, type Options } from './config.js';

type Args = Record<string, any>;
export type Content = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string };
export interface Result { [key: string]: unknown; content: Content[]; structuredContent: Record<string, any>; isError: boolean }
export interface Tool { name: string; description: string; inputSchema: { type: 'object'; properties: Record<string, any>; required: string[]; additionalProperties: boolean } }
export const tools: Tool[] = JSON.parse(fs.readFileSync(path.join(ASSETS, 'tools.json'), 'utf8'));
const ajv = new Ajv({ allErrors: true, strict: false });
const validators = new Map(tools.map(tool => [tool.name, ajv.compile(tool.inputSchema)]));

export function parseResponse(text: string): any {
  try { const parsed = JSON.parse(text); if (parsed?.heartbeat !== true) return parsed; } catch {}
  const lines = text.split(/\r?\n/).filter(Boolean);
  for (let n = lines.length - 1; n >= 0; n--) {
    try { const parsed = JSON.parse(lines[n]); if (parsed && parsed.heartbeat !== true) return parsed; } catch {}
  }
  throw new BridgeError('INVALID_RESPONSE', 'Backend returned neither JSON nor a final NDJSON result');
}
function json(value: unknown, fallback: any = {}): any {
  if (value === undefined) return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { throw new BridgeError('INVALID_ARGUMENTS', 'Expected a valid JSON value'); }
}
function object(value: unknown): Args {
  const parsed = json(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new BridgeError('INVALID_ARGUMENTS', 'Expected a JSON object');
  return parsed;
}
const csv = (s: any) => String(s).split(',').map(x => x.trim()).filter(Boolean);
function triple(value: unknown, fallback: number[]): number[] {
  if (value === undefined) return fallback;
  const result = typeof value === 'string' ? value.split(',').map(Number) : value;
  if (!Array.isArray(result) || result.length !== 3 || result.some(x => typeof x !== 'number' || !Number.isFinite(x))) throw new BridgeError('INVALID_ARGUMENTS', 'Camera coordinates need three finite numbers');
  return result;
}
function view(args: Args) {
  const size = Math.max(120, Math.min(1600, args.max_size || 560));
  const match = /^(\d+)\s*[x×]\s*(\d+)$/.exec(args.view_size || '');
  const result: Args = { from: triple(args.from, [7, -7, 5]), look_at: triple(args.look_at, [0, 0, 1]),
    width: match ? +match[1] : size, height: match ? +match[2] : Math.max(120, Math.round(size * 9 / 16)) };
  if (result.width > 4096 || result.height > 4096 || result.width < 1 || result.height < 1) throw new BridgeError('INVALID_ARGUMENTS', 'Image dimensions must be 1..4096');
  for (const key of ['lens', 'ortho', 'ortho_scale', 'shading', 'overlays', 'diagnostics']) if (args[key] !== undefined) result[key] = args[key];
  if (args.view_mode) result.mode = args.view_mode;
  return result;
}
function failed(value: any): boolean {
  if (!value || typeof value !== 'object') return false;
  return value.ok === false || ['failed', 'killed', 'timeout'].includes(value.status)
    || ['result', 'job', 'execution'].some(key => failed(value[key]));
}
function image(bytes: Buffer): Content {
  let mimeType: string;
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) mimeType = 'image/png';
  else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) mimeType = 'image/jpeg';
  else if (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP') mimeType = 'image/webp';
  else throw new BridgeError('INVALID_IMAGE', 'Backend returned an unsupported image signature');
  if (bytes.length > 16 * 1024 * 1024) throw new BridgeError('IMAGE_TOO_LARGE', 'Image exceeds 16 MiB; request a smaller image');
  return { type: 'image', data: bytes.toString('base64'), mimeType };
}
export function errorResult(error: unknown): Result {
  const e = error instanceof BridgeError ? error : new BridgeError('INTERNAL_ERROR', error instanceof Error ? error.message : String(error));
  const data = { ok: false, code: e.code, error: e.message, ...(e.details === undefined ? {} : { details: e.details }) };
  return { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data, isError: true };
}

export class Bridge {
  readonly backend: Backend;
  readonly opts: Options;
  private readonly holder: string;
  constructor(input: Partial<Options> = {}) { this.opts = options(input); this.backend = new Backend(this.opts); this.holder = this.opts.holder || `blender-agent-${process.pid}`; }
  private async request(route: string, body?: Args, signal?: AbortSignal, timeoutMs?: number): Promise<any> {
    const { response, bytes } = await this.backend.request(route, body === undefined ? undefined : { holder: this.holder, ...body }, signal, timeoutMs);
    const result = parseResponse(bytes.toString('utf8'));
    if (!response.ok) return { ...result, ok: false, httpStatus: response.status };
    return result;
  }
  private async worker(body: Args, signal?: AbortSignal): Promise<any> { return this.request('/worker', { ...body, isolated: true }, signal); }
  private async startWorker(name: string, preload: string | undefined, signal?: AbortSignal) {
    const r = await this.worker({ op: 'start', name, preload, engine: 'workbench', warmup: false }, signal);
    if (failed(r)) throw new BridgeError('WORKER_START_FAILED', r.error || r.result?.error || 'Worker did not start', r);
    return r;
  }
  private async guiAvailable(signal?: AbortSignal): Promise<boolean> {
    const doctor = await this.request('/doctor', undefined, signal);
    const kind = doctor.kind || doctor.addon?.kind;
    if (kind === 'ok') return true;
    if (['blender-unreachable', 'addon-unreachable', 'not-connected'].includes(kind)) return false;
    throw new BridgeError('GUI_NOT_READY', 'GUI state is ambiguous or busy; choose an explicit session or inspect doctor before executing code', doctor);
  }
  private async see(args: Args, signal?: AbortSignal): Promise<any> {
    if (args.session) {
      const name = args.session === 'auto' ? 'interactive' : args.session;
      await this.startWorker(name, args.preload, signal);
      return this.worker({ op: 'see', name, spec: view(args) }, signal);
    }
    const custom = ['from', 'look_at', 'lens', 'ortho', 'ortho_scale', 'view_size', 'shading', 'overlays', 'view_mode'].some(k => args[k] !== undefined);
    const route = custom ? '/view' : `/frame.png?size=${Math.max(120, Math.min(1600, args.max_size || 560))}&full=${args.full ? 1 : 0}&area=${args.area || 0}`;
    const { response, bytes } = await this.backend.request(route, custom ? view(args) : undefined, signal);
    if (!response.ok) {
      const result = parseResponse(bytes.toString('utf8'));
      if (args.auto !== false) {
        // A frame is read-only. Retrying code after a transport error is forbidden.
        const name = 'interactive'; await this.startWorker(name, undefined, signal);
        return this.worker({ op: 'see', name, spec: view(args) }, signal);
      }
      return { ...result, ok: false, httpStatus: response.status };
    }
    return { ok: true, mode: custom ? 'view' : 'viewport', hash: createHash('sha256').update(bytes).digest('hex'), png_b64: bytes.toString('base64'),
      ...(response.headers.has('x-dsh-view') ? { meta: JSON.parse(decodeURIComponent(response.headers.get('x-dsh-view')!)) } : {}) };
  }
  private headlessBody(args: Args): Args {
    const body = { ...args };
    for (const [from, to] of Object.entries({ timeout_ms: 'timeoutMs', script_file: 'scriptFile', factory_startup: 'factoryStartup', use_user_config: 'useUserConfig', include_noise: 'includeNoise', out_json: 'outJson' })) {
      if (args[from] !== undefined) { body[to] = args[from]; delete body[from]; }
    }
    if (args.env !== undefined) body.env = object(args.env);
    if (args.shots !== undefined) body.shots = json(args.shots);
    // JSON arrays preserve quoted paths and arguments; legacy strings use the original tokenizer.
    if (typeof args.args === 'string') body.args = args.args.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)?.map((x: string) => /^(["']).*\1$/.test(x) ? x.slice(1, -1) : x) || [];
    for (const k of ['attach_images', 'as_job', 'wait_s']) delete body[k];
    return body;
  }
  private async execute(name: string, args: Args, signal?: AbortSignal): Promise<any> {
    if (signal?.aborted) throw new BridgeError('CANCELLED', 'Request cancelled before dispatch');
    if (name === 'blender_rt_see') return this.see(args, signal);
    if (name === 'blender_rt_commands') return this.request('/commands', undefined, signal);
    if (name === 'blender_viewport') {
      switch (args.op) {
        case 'start': return { ok: true, ...await this.backend.ensure() };
        case 'stop': await this.backend.stop(); return { ok: true, stopped: true };
        case 'restart': await this.backend.stop(); return { ok: true, ...await this.backend.ensure() };
        case 'doctor': { const result = await this.request('/doctor', undefined, signal); return { ...result, kind: result.kind || result.addon?.kind || 'unknown' }; }
        case 'status': case 'who': return this.request('/' + args.op, undefined, signal);
        case 'lease': return this.request('/lease', { ...args, ttlMs: args.ttl_ms ?? args.ttlMs, scope: args.scope === undefined ? undefined : csv(args.scope), holder: args.holder || this.holder }, signal);
        case 'release': return this.request('/release', { holder: args.holder || this.holder }, signal);
        case 'launch': return this.request('/launch', { file: args.file, exe: args.exe, waitMs: args.wait_ms, addonModule: args.addon_module, addonFile: args.addon_file || path.join(ASSETS, 'addon/dsh_blender_bridge.py'), dryRun: args.dry_run }, signal);
        default: throw new BridgeError('INVALID_ARGUMENTS', 'Unknown blender_viewport op');
      }
    }
    if (name === 'blender_rt_cmd') return this.request('/cmd', { name: args.name, params: object(args.params), timeoutMs: args.timeout_ms }, signal);
    if (name === 'blender_rt_worker') {
      const body: Args = { ...args, timeoutMs: args.timeout_ms, purgePrefix: args.purge_prefix };
      if (args.op === 'see') body.spec = view(args);
      if (args.op === 'watch') body.spec = args;
      return this.worker(body, signal);
    }
    if (name === 'blender_rt_plan') {
      const payload = object(args.args);
      if (args.op === 'report' && args.path) payload.path = args.path;
      if (!args.session || args.op === 'catalog') return this.request('/plan', { op: args.op, args: payload }, signal);
      const { planHeadlessTarget } = await import(pathToFileURL(path.join(ASSETS, 'plan-routing.mjs')).href);
      const target = planHeadlessTarget(args.op);
      if (!target) throw new BridgeError('UNSUPPORTED_SESSION_OP', 'This plan op has no upstream headless mapping; use the GUI route or query catalog');
      const session = args.session === 'auto' ? 'plan-' + target.api.replace(/^dsh_|_api$/g, '') : args.session;
      await this.startWorker(session, target.preload, signal);
      const code = `import json as _json\n_s = _json.dumps(_json.loads(${JSON.stringify(JSON.stringify(payload))}))\n_r = K.${target.api}["dispatch"](${JSON.stringify(target.sub)}, _s)\nprint("HEADLESS " + (_r if isinstance(_r, str) else _json.dumps(_r, ensure_ascii=False)))`;
      const result = await this.worker({ op: 'exec', name: session, code, timeoutMs: args.timeout_ms || this.opts.timeoutMs }, signal);
      return failed(result) ? result : { ok: true, op: args.op, via: 'worker:' + session, result: result.result?.result };
    }
    if (name === 'blender_rt_do') {
      if ((!args.code && !args.file) || (args.code && args.file)) throw new BridgeError('INVALID_ARGUMENTS', 'Provide exactly one of code or file');
      let session = args.session;
      if (!session && args.auto !== false && !await this.guiAvailable(signal)) session = 'interactive';
      let result: any;
      if (session) {
        session = session === 'auto' ? 'interactive' : session;
        await this.startWorker(session, args.preload, signal);
        const code = args.code || `import os as _osf, sys as _sysf\n_sf = ${JSON.stringify(args.file)}\n_sf = K.win_path(_sf) if hasattr(K, 'win_path') else _sf\nif not _osf.path.isabs(_sf):\n    if not bpy.data.filepath:\n        raise ValueError('Relative script requires a saved .blend; provide an absolute script path')\n    _sf = _osf.path.join(_osf.path.dirname(bpy.data.filepath), _sf.removeprefix('//'))\n_sf = _osf.path.normpath(_sf)\n__file__ = _sf\nif _osf.path.dirname(_sf) not in _sysf.path:\n    _sysf.path.insert(0, _osf.path.dirname(_sf))\nexec(compile(open(_sf, encoding='utf-8-sig').read(), _sf, 'exec'), globals())`;
        result = await this.worker({ op: 'exec', name: session, code }, signal);
      } else result = await this.request('/act', { code: args.code || '', file: args.file }, signal);
      if (failed(result) || args.see === false) return result;
      // Image failure must not hide a successful mutation or cause its replay.
      try { return { ok: true, execution: result, frame: await this.see({ ...args, session, auto: false }, signal) }; }
      catch (e) { return { ok: true, execution: result, frame: { ok: false, error: e instanceof Error ? e.message : String(e) }, warning: 'Execution completed; image failed. Do not repeat code.' }; }
    }
    if (name === 'blender_rt_watch') {
      let session = args.session;
      if (!session && !await this.guiAvailable(signal)) session = 'interactive';
      if (session) {
        session = session === 'auto' ? 'interactive' : session;
        await this.startWorker(session, undefined, signal);
        if (args.code) { const r = await this.worker({ op: 'exec', name: session, code: args.code }, signal); if (failed(r)) return r; }
        return this.worker({ op: 'watch', name: session, spec: { ...view(args), seconds: args.seconds, fps: args.fps } }, signal);
      }
      if (args.code) { const r = await this.request('/act', { code: args.code }, signal); if (failed(r)) return r; }
      const seconds = Math.max(0.2, Math.min(20, args.seconds || 2)), fps = Math.max(0.5, Math.min(8, args.fps || 4));
      const count = Math.min(6, Math.max(1, Math.round(seconds * fps))), frames = [];
      const start = Date.now();
      for (let i = 0; i < count; i++) {
        frames.push({ atMs: Date.now() - start, ...await this.see({ ...args, auto: false }, signal) });
        if (i < count - 1) await delay(seconds * 1000 / count, undefined, { signal });
      }
      return { ok: true, frames };
    }
    if (name === 'blender_rt_headless') {
      const body = this.headlessBody(args);
      // Long tasks always obtain a server-side job handle before any waiting.
      const runId = 'run-' + randomUUID();
      const start = await this.request('/job', { ...body, runId, op: 'start' }, signal);
      if (failed(start)) return start;
      const id = start.job?.id;
      if (!id) throw new BridgeError('INVALID_RESPONSE', 'Job accepted without an id; inspect backend job list before retrying');
      if (args.as_job && !args.wait_s) return { ...start, kind: 'promoted', jobId: id, hint: 'Use blender_rt_job wait/collect; backend start is required for cross-CLI persistence.' };
      const wait = Math.min(600000, args.wait_s !== undefined ? Math.max(1, args.wait_s * 1000) : 100000, Math.max(1, this.opts.timeoutMs - 1000));
      try {
        const waited = await this.request('/job', { op: 'wait', id, timeoutMs: wait }, signal, Math.min(this.opts.timeoutMs, wait + 2000));
        return { ...waited, jobId: id, ...(waited.job && ['queued', 'running'].includes(waited.job.status) ? { kind: 'promoted' } : {}) };
      } catch (e) {
        if (e instanceof BridgeError && ['TIMEOUT', 'CANCELLED', 'TRANSPORT_ERROR'].includes(e.code)) return { ok: true, kind: 'promoted', jobId: id, executionStatus: 'unknown', reason: e.code, hint: 'Accepted job was not replayed; use blender_rt_job wait/collect.' };
        throw e;
      }
    }
    if (name === 'blender_rt_job') return this.request('/job', { ...this.headlessBody(args), op: args.op }, signal);
    if (name === 'blender_rt_loop') {
      if (args.target !== 'session') return this.request('/loop', { ...args, spec: object(args.spec) }, signal);
      const session = args.session || 'blender-agent-loop'; await this.startWorker(session, 'runner', signal);
      const callArgs: Record<string, unknown[]> = { start: [object(args.spec)], status: [args.history || 8, args.board || 0], board: [args.limit || 10, args.groups !== false], export: [args.path || null, args.top || 1, !!args.include_variants, args.note || ''], bench: [args.iterations || 5000], stop: [], help: [] };
      if (!callArgs[args.op]) throw new BridgeError('INVALID_ARGUMENTS', 'Unknown loop op');
      const code = `import json as _json\n_a = _json.loads(${JSON.stringify(JSON.stringify(callArgs[args.op]))})\n_r = K.dsh_loop_api[${JSON.stringify(args.op === 'start' ? 'sync' : args.op)}](*_a)\nprint("HEADLESS " + (_r if isinstance(_r, str) else _json.dumps(_r)))`;
      return this.worker({ op: 'exec', name: session, code }, signal);
    }
    if (['blender_rt_perf', 'blender_rt_opt'].includes(name)) return this.request(name.endsWith('perf') ? '/perf' : '/opt', { op: args.op, args: object(args.args) }, signal);
    if (name === 'blender_rt_txn' || name === 'blender_rt_preset') {
      const payload = { ...args }; delete payload.op;
      for (const key of ['objects', 'tags', 'targets', 'names']) if (payload[key] !== undefined) payload[key] = csv(payload[key]);
      if (name === 'blender_rt_preset' && payload.data !== undefined) payload.data = object(payload.data);
      return this.request(name.endsWith('txn') ? '/txn' : '/preset', { op: args.op, args: payload }, signal);
    }
    throw new BridgeError('UNKNOWN_TOOL', `Unknown tool ${name}`);
  }
  async call(name: string, args: Args = {}, signal?: AbortSignal): Promise<Result> {
    try {
      const validate = validators.get(name);
      if (!validate) throw new BridgeError('UNKNOWN_TOOL', `Unknown tool ${name}; use tools to list names`);
      if (!validate(args)) throw new BridgeError('INVALID_ARGUMENTS', ajv.errorsText(validate.errors));
      let raw = await this.execute(name, args, signal);
      // Never include credentials in a tool result, even when start returns state.
      if (raw?.token) { const { token: _, ...rest } = raw; raw = rest; }
      const images: Content[] = [], warnings: string[] = [];
      const seen = new Set<string>();
      const collect = (value: any): any => {
        if (Array.isArray(value)) return value.map(collect);
        if (!value || typeof value !== 'object') return value;
        const out: Args = {};
        for (const [key, val] of Object.entries(value)) {
          if (key === 'png_b64' && typeof val === 'string') {
            const hash = createHash('sha256').update(val).digest('hex');
            if (!seen.has(hash) && images.length < 6) { images.push(image(Buffer.from(val, 'base64'))); seen.add(hash); }
            out.image = { mimeType: 'image/png', contentIndex: images.length };
          } else out[key] = collect(val);
        }
        return out;
      };
      const structured = collect(raw);
      const attach = args.attach_images === true || args.attach_images === 'sheet' || (args.attach_images !== false && ['img_digest', 'qc_compare', 'visualreport_report', 'qc_visual_report', 'shapesolve_solve'].includes(String(args.op)));
      if (attach && images.length < 6) {
        const paths: string[] = [];
        const scan = (value: any, key = '') => {
          if (typeof value === 'string' && /\.(png|jpe?g|webp)$/i.test(value) && ['path', 'crop', 'sheet', 'overlay', 'out', 'file', 'annotated', 'atlas', 'diff_heat'].includes(key)) paths.push(value);
          else if (Array.isArray(value)) value.forEach(v => scan(v, key));
          else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) scan(v, String(k));
        };
        scan(raw);
        const selected = args.attach_images === 'sheet' ? paths.filter(p => /sheet|montage/i.test(p)).slice(0, 1) : [...new Set(paths)].slice(0, 3);
        for (const p of selected) {
          try { images.push(image(fs.readFileSync(p))); } catch (e) { warnings.push(`Image unavailable: ${p}: ${e instanceof Error ? e.message : String(e)}`); }
        }
      }
      if (warnings.length) structured.imageWarnings = warnings;
      return { content: [{ type: 'text', text: JSON.stringify(structured) }, ...images], structuredContent: structured, isError: failed(raw) };
    } catch (e) { return errorResult(e); }
  }
  async dispose() { await this.backend.dispose(); }
}
