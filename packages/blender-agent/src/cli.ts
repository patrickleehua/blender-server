#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { Bridge, errorResult, tools } from './core.js';
import { BridgeError, options, PACKAGE_ROOT, publicState, VERSION, type Options } from './config.js';
import { serveMcp } from './mcp.js';

const HELP = `blender-agent ${VERSION}
  mcp                                  MCP stdio server
  doctor                               GUI health check (kind=ok required)
  tools                                List 15 tool contracts
  catalog [--family audit] [--full]      Discover plan operations
  call <tool> --json '{...}'             Call a tool
  call <tool> --file <args.json>         Avoid shell quoting for multiline/Unicode arguments
  call <tool> --stdin                   Read tool arguments as JSON from stdin
  backend start|status|stop             Explicit persistent lifecycle
  config --host claude|codex            Print host config; never write global settings
Global: --port 9877 --addon-port 9876 --worker-port 9879 --workdir <path>
        --blender <executable> --holder <session-id> --timeout-ms 180000 --no-auto-start
CLI-created temporary backends are cleaned on exit. Run backend start first for
worker/job state across separate CLI calls; use the same ports and workdir.
JSON results go to stdout; diagnostics go to backend log/stderr.
`;
async function main(): Promise<void> {
  if (process.argv[2] === '__backend-service') {
    const { backendService } = await import('./backend-service.js'); await backendService(); return;
  }
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    port: { type: 'string' }, 'addon-port': { type: 'string' }, 'worker-port': { type: 'string' }, workdir: { type: 'string' }, blender: { type: 'string' }, holder: { type: 'string' }, 'timeout-ms': { type: 'string' },
    'no-auto-start': { type: 'boolean' }, json: { type: 'string' }, file: { type: 'string' }, stdin: { type: 'boolean' }, family: { type: 'string' }, full: { type: 'boolean' }, host: { type: 'string' }, help: { type: 'boolean', short: 'h' }, version: { type: 'boolean', short: 'v' },
  } });
  if (values.version) { process.stdout.write(VERSION + '\n'); return; }
  if (values.help || !positionals.length) { process.stdout.write(HELP); return; }
  const input: Partial<Options> = {};
  for (const [flag, key] of Object.entries({ port: 'port', 'addon-port': 'addonPort', 'worker-port': 'workerPort', 'timeout-ms': 'timeoutMs' })) if ((values as Record<string, unknown>)[flag] !== undefined) (input as any)[key] = Number((values as Record<string, unknown>)[flag]);
  if (values.workdir) input.workdir = values.workdir;
  if (values.blender) input.blender = values.blender;
  if (values.holder) input.holder = values.holder;
  if (values['no-auto-start']) input.autoStart = false;
  const opts = options(input);
  if (positionals[0] === 'config') {
    const args = [path.join(PACKAGE_ROOT, 'dist/cli.js'), 'mcp', '--port', String(opts.port), '--addon-port', String(opts.addonPort), '--worker-port', String(opts.workerPort), '--workdir', opts.workdir];
    if (opts.blender) args.push('--blender', opts.blender);
    if (values.host === 'claude') process.stdout.write(JSON.stringify({ mcpServers: { 'blender-agent': { command: process.execPath, args } } }, null, 2) + '\n');
    else if (values.host === 'codex') process.stdout.write(`[mcp_servers.blender-agent]\ncommand = ${JSON.stringify(process.execPath)}\nargs = ${JSON.stringify(args)}\n`);
    else throw new BridgeError('INVALID_ARGUMENTS', '--host must be claude or codex');
    return;
  }
  if (positionals[0] === 'tools') { process.stdout.write(JSON.stringify({ tools }, null, 2) + '\n'); return; }
  const bridge = new Bridge(opts);
  let shuttingDown = false;
  const cancel = new AbortController();
  const shutdown = () => {
    if (shuttingDown) return; shuttingDown = true; cancel.abort();
    void bridge.dispose().finally(() => process.exit(130));
  };
  process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
  if (positionals[0] === 'mcp') { await serveMcp(bridge); return; }
  let result: any;
  try {
    if (positionals[0] === 'backend') {
      if (positionals[1] === 'start') result = { ok: true, ...publicState(await bridge.backend.ensure(true)) };
      else if (positionals[1] === 'status') result = await bridge.backend.status();
      else if (positionals[1] === 'stop') { await bridge.backend.stop(); result = { ok: true, stopped: true }; }
      else throw new BridgeError('INVALID_ARGUMENTS', 'backend requires start, status or stop');
    } else if (positionals[0] === 'doctor') {
      const called = await bridge.call('blender_viewport', { op: 'doctor' }, cancel.signal);
      result = called.structuredContent;
      if (called.isError || result.kind !== 'ok') process.exitCode = 1;
    } else if (positionals[0] === 'catalog') {
      const called = await bridge.call('blender_rt_plan', { op: 'catalog', args: { ...(values.family ? { family: values.family } : {}), ...(values.full ? { full: true } : {}) } }, cancel.signal);
      result = called;
      if (called.isError) process.exitCode = 1;
    } else if (positionals[0] === 'call') {
      if (!positionals[1]) throw new BridgeError('INVALID_ARGUMENTS', 'call requires a tool name');
      if ([values.json, values.file, values.stdin].filter(x => x !== undefined && x !== false).length > 1) throw new BridgeError('INVALID_ARGUMENTS', 'Choose exactly one of --json, --file or --stdin');
      const text = values.file ? fs.readFileSync(path.resolve(values.file), 'utf8') : values.stdin ? fs.readFileSync(0, 'utf8') : values.json || '{}';
      let args: unknown; try { args = JSON.parse(text.replace(/^\uFEFF/, '')); } catch { throw new BridgeError('INVALID_ARGUMENTS', 'Tool input is not valid JSON'); }
      if (positionals[1] === 'blender_viewport' && ['lease', 'release'].includes((args as any)?.op) && !opts.holder && !(args as any)?.holder) throw new BridgeError('EXPLICIT_HOLDER_REQUIRED', 'Cross-CLI leases require --holder <session-id> (or BLENDER_AGENT_HOLDER). Use the same holder for writes and release; parallel agents use different holders.');
      const durable = positionals[1] === 'blender_rt_headless' || positionals[1] === 'blender_rt_job' && (args as any)?.op === 'start' || positionals[1] === 'blender_rt_worker' && ['start', 'restart'].includes((args as any)?.op);
      if (durable && !(await bridge.backend.identity())?.persistent) throw new BridgeError('PERSISTENT_BACKEND_REQUIRED', 'Run backend start with the same ports/workdir first. Worker/job state must survive separate CLI calls.');
      result = await bridge.call(positionals[1], args as any, cancel.signal);
      if (result.isError) process.exitCode = 1;
    } else throw new BridgeError('INVALID_ARGUMENTS', `Unknown command ${positionals[0]}`);
  } finally { await bridge.dispose(); }
  process.stdout.write(JSON.stringify(result) + '\n');
}
main().catch(e => { process.stderr.write(`[blender-agent] ${e instanceof Error ? e.message : String(e)}\n`); process.stdout.write(JSON.stringify(errorResult(e)) + '\n'); process.exitCode = 1; });
