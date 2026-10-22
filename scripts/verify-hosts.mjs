#!/usr/bin/env node
// Real host acceptance driver. It invokes installed CLIs, never substitutes models.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({ options: {
  package: { type: 'string' }, blender: { type: 'string' }, host: { type: 'string', default: 'both' },
  'claude-exe': { type: 'string' }, 'codex-entry': { type: 'string' },
  'run-root': { type: 'string', default: path.join(repo, 'tmp', 'host-acceptance') },
} });
if (!values.package || !values.blender || !['both', 'claude', 'codex'].includes(values.host)) {
  throw new Error('Required: --package <installed-package-directory> --blender <executable> [--host both|claude|codex]');
}
const pkg = path.resolve(values.package), blender = path.resolve(values.blender);
const cli = path.join(pkg, 'dist', 'cli.js'), setup = path.join(pkg, 'scripts', 'portable-setup.mjs');
const evidence = path.join(repo, 'evidence', 'hosts');
fs.mkdirSync(evidence, { recursive: true });

async function run(command, args, cwd, basename, timeout = 900000) {
  fs.mkdirSync(path.dirname(basename), { recursive: true });
  const stdout = fs.openSync(basename + '.stdout', 'w'), stderr = fs.openSync(basename + '.stderr', 'w');
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, shell: false, windowsHide: true, stdio: ['ignore', stdout, stderr] });
    fs.closeSync(stdout); fs.closeSync(stderr);
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeout);
    child.once('error', e => { clearTimeout(timer); reject(e); });
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      resolve({ exitCode: code, signal, timedOut, durationMs: Date.now() - started });
    });
  });
}
function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== 'object') return value;
  const result = {};
  for (const [k, v] of Object.entries(value)) {
    if ((k === 'data' && typeof v === 'string' && ['base64', undefined].includes(value.encoding)) || (k === 'data' && value.type === 'image')) {
      result.imageBytes = Math.floor(v.length * 3 / 4);
      result.imageDataSha256 = createHash('sha256').update(v).digest('hex');
    } else if (/^(api[_-]?key|access[_-]?token|authorization|refresh[_-]?token)$/i.test(k)) result[k] = '[redacted]';
    else result[k] = redact(v);
  }
  return result;
}
async function verify(host) {
  const project = path.resolve(values['run-root'], host + ' 中文 空格');
  fs.mkdirSync(project, { recursive: true });
  if (fs.existsSync(path.join(project, 'outputs', 'stool.blend'))) throw new Error('Use a fresh --run-root; previous artifacts must not satisfy this run');
  const port = host === 'claude' ? 29877 : 30877;
  const setupResult = await run(process.execPath, [setup, '--project', project, '--host', host,
    '--port', String(port), '--addon-port', String(port - 1), '--worker-port', String(port + 2),
    '--blender', blender, '--apply'], project, path.join(project, 'setup'), 60000);
  if (setupResult.exitCode !== 0) throw new Error(`Setup failed: ${project}`);
  const prefix = host === 'claude' ? 'Claude' : 'Codex';
  const task = `Use the blender-agent Skill installed in this project's ${host === 'claude' ? '.claude' : '.agents'}/skills/blender-agent/SKILL.md.
This is an isolated real acceptance test. Use only this project's blender-agent MCP server for Blender work. No other MCP servers, agents or external services. Do not change source code or global settings. No questions are needed; all Blender mutations below are authorized in this new isolated test worker.
Read the Skill. Query the real tool catalog. Use an explicit worker/session named ${host}-stool. There is no GUI addon in this test: a GUI doctor result of unreachable is expected; do not try to launch GUI. You may clear factory default objects only inside this test worker.
Build a small round stool using meters internally with scale_length=1. The following are final mandatory world dimensions and positions:
${prefix}Top: round cylinder radius 0.45m, depth 0.08m, centered at (0,0,0.79).
${prefix}LegA: box 0.08m x 0.08m x 0.75m, centered (-0.28,-0.22,0.375).
${prefix}LegB: same box centered (0.28,-0.22,0.375).
${prefix}LegC: same box centered (0,0.28,0.375).
First create the top with radius 0.40m and three legs. Retrieve and actually inspect a native MCP image, then enlarge only the top to the final radius 0.45m and give it a red material with brown legs. Retrieve and inspect a fresh native MCP image after the change. For a useful close view, set the camera from (2,-2,1.6) looking at (0,0,0.4). Avoid relying on text that rendering succeeded.
Check object names, world bounding dimensions and positions against the mandatory values. Save an editable ${project.replaceAll('\\', '/')}/outputs/stool.blend and a GLB ${project.replaceAll('\\', '/')}/outputs/stool.glb. Export just the four stool meshes using Blender's bundled glTF exporter. If you need a file-level snapshot, use the worker's txn preload / K.dsh_txn_api or query the catalog for the right session route; do not accidentally mutate a different scene.
Report which actual images you saw, file paths, dimension evidence, and any real failure. Stop the worker after saving. Do not claim overall acceptance; a separate Blender process will independently reopen your blend and GLB.`;
  fs.writeFileSync(path.join(project, 'task.txt'), task);
  let command, args;
  if (host === 'claude') {
    command = values['claude-exe'] || (process.platform === 'win32' ? path.join(process.env.APPDATA, 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe') : 'claude');
    args = ['-p', task, '--model', 'claude-opus-5-5', '--effort', 'medium', '--strict-mcp-config',
      '--mcp-config', path.join(project, '.mcp.json'), '--setting-sources', 'project',
      '--tools', 'Read', '--allowedTools', 'Read,mcp__blender-agent__*', '--permission-mode', 'dontAsk',
      '--no-session-persistence', '--output-format', 'stream-json', '--verbose'];
  } else {
    command = process.execPath;
    const codex = values['codex-entry'] || path.join(process.env.APPDATA, 'npm', 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
    const mcpArgs = [cli, 'mcp', '--port', String(port), '--addon-port', String(port - 1), '--worker-port', String(port + 2),
      '--workdir', path.join(project, '.blender-agent', 'runtime'), '--blender', blender];
    // Per-invocation overrides use the existing CLI authentication without writing global config.
    args = [codex, 'exec', '--ignore-user-config', '--ephemeral', '--skip-git-repo-check', '--json',
      '--model', 'gpt-6.1-sol', '-c', 'model_reasoning_effort="medium"', '--sandbox', 'danger-full-access',
      '-c', `mcp_servers.blender-agent.command=${JSON.stringify(process.execPath)}`,
      '-c', `mcp_servers.blender-agent.args=${JSON.stringify(mcpArgs)}`,
      '-c', 'mcp_servers.blender-agent.required=true', '-c', 'mcp_servers.blender-agent.startup_timeout_sec=60',
      '-c', 'mcp_servers.blender-agent.tool_timeout_sec=900', task];
  }
  const runResult = await run(command, args, project, path.join(project, 'host'));
  const transcript = fs.readFileSync(path.join(project, 'host.stdout'), 'utf8');
  const events = transcript.split(/\r?\n/).filter(Boolean).map(line => { try { return JSON.parse(line); } catch { return { unparsed: line }; } });
  fs.writeFileSync(path.join(evidence, host + '-trace.json'), JSON.stringify(redact(events), null, 2));
  const check = await run(blender, ['--background', '--factory-startup', '--python-exit-code', '1',
    '--python', path.join(repo, 'scripts', 'verify-host-artifacts.py'), '--', project, prefix],
    project, path.join(project, 'independent'), 120000);
  const independent = fs.existsSync(path.join(project, 'independent-check.json'))
    ? JSON.parse(fs.readFileSync(path.join(project, 'independent-check.json'), 'utf8')) : null;
  const summary = { host, requestedModel: host === 'claude' ? 'claude-opus-5-5' : 'gpt-6.1-sol', effort: 'medium',
    package: JSON.parse(fs.readFileSync(path.join(pkg, 'package.json'), 'utf8')).version,
    toolContractSha256: createHash('sha256').update(fs.readFileSync(path.join(pkg, 'assets', 'tools.json'))).digest('hex'),
    skillSha256: createHash('sha256').update(fs.readFileSync(path.join(pkg, 'assets', 'skill', 'SKILL.md'))).digest('hex'),
    cliSha256: createHash('sha256').update(fs.readFileSync(cli)).digest('hex'),
    assetFingerprint: JSON.parse(fs.readFileSync(path.join(pkg, 'assets', 'manifest.json'), 'utf8')).fingerprint,
    project, run: runResult, independentRun: check, independent, transcriptSha256: createHash('sha256').update(transcript).digest('hex') };
  fs.writeFileSync(path.join(evidence, host + '-result.json'), JSON.stringify(summary, null, 2));
  process.stdout.write(JSON.stringify({ host, ...runResult, independent: independent?.ok ?? false, evidence: path.join(evidence, host + '-result.json') }) + '\n');
  if (runResult.exitCode !== 0 || check.exitCode !== 0 || !independent?.ok) process.exitCode = 1;
}

for (const host of values.host === 'both' ? ['claude', 'codex'] : [values.host]) await verify(host);
