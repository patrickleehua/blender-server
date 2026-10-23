#!/usr/bin/env node
// Project-local install only. No host/global configuration is changed.
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const manifestName = '.blender-agent/install-manifest.json';
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const portable = (path) => path.split(sep).join('/');

function parseArgs(argv) {
  const options = { host: 'both', apply: false, uninstall: false, port: 9877, 'addon-port': 9876, 'worker-port': 9879 };
  const values = new Set(['project', 'host', 'port', 'addon-port', 'worker-port', 'workdir', 'blender', 'cli']);
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, '');
    if (argv[i] === '--help') return { help: true };
    if (['apply', 'uninstall', 'dry-run'].includes(key)) options[key] = true;
    else if (values.has(key) && argv[i].startsWith('--') && argv[i + 1] && !argv[i + 1].startsWith('--')) options[key] = argv[++i];
    else throw new Error(`Unknown or incomplete argument: ${argv[i]}`);
  }
  if (!options.project) throw new Error('--project <existing-project-directory> is required');
  if (!['codex', 'claude', 'both'].includes(options.host)) throw new Error('--host must be codex, claude or both');
  if (options.apply && options['dry-run']) throw new Error('Choose --apply or --dry-run');
  for (const flag of ['port', 'addon-port', 'worker-port']) {
    options[flag] = Number(options[flag]);
    if (!Number.isInteger(options[flag]) || options[flag] < 1 || options[flag] > 65535) throw new Error(`--${flag} must be 1..65535`);
  }
  if (new Set([options.port, options['addon-port'], options['worker-port']]).size !== 3) throw new Error('Backend, addon and worker ports must be distinct');
  options.project = realpathSync(resolve(options.project));
  if (!lstatSync(options.project).isDirectory()) throw new Error('--project must be a directory');
  options.workdir = resolve(options.workdir ?? join(options.project, '.blender-agent', 'runtime'));
  return options;
}

function projectPath(project, path) {
  if (isAbsolute(path)) throw new Error(`Absolute managed path rejected: ${path}`);
  const absolute = resolve(project, path);
  const rel = relative(project, absolute);
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error(`Path outside project rejected: ${path}`);
  let cursor = project;
  for (const segment of rel.split(sep)) {
    cursor = join(cursor, segment);
    if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) throw new Error(`Refusing symlink/junction in managed path: ${cursor}`);
  }
  return absolute;
}

function filesBelow(directory, prefix = '') {
  return readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap((entry) => {
    if (entry.isSymbolicLink()) throw new Error(`Skill source contains symlink: ${entry.name}`);
    const path = join(directory, entry.name);
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory() ? filesBelow(path, name) : [{ path: name, bytes: readFileSync(path) }];
  });
}

function readManifest(project) {
  const path = projectPath(project, manifestName);
  if (!existsSync(path)) return { version: 1, files: {} };
  const value = JSON.parse(readFileSync(path, 'utf8'));
  if (value.version !== 1 || !value.files || typeof value.files !== 'object' || Array.isArray(value.files)) throw new Error('Unsupported install manifest');
  for (const [name, hash] of Object.entries(value.files)) {
    projectPath(project, name);
    if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error(`Invalid manifest hash: ${name}`);
  }
  return value;
}

function setup(options) {
  const { project } = options;
  const previous = readManifest(project);
  const plan = [];
  const managed = { ...previous.files };
  if (options.uninstall) {
    for (const [name, expected] of Object.entries(previous.files)) {
      const path = projectPath(project, name);
      if (!existsSync(path)) { delete managed[name]; plan.push({ path: name, action: 'missing' }); }
      else if (lstatSync(path).isFile() && sha256(readFileSync(path)) === expected) {
        plan.push({ path: name, action: 'remove' });
        if (options.apply) unlinkSync(path);
        delete managed[name];
      } else plan.push({ path: name, action: 'preserve-modified' });
    }
    const manifest = projectPath(project, manifestName);
    if (options.apply && existsSync(manifest)) {
      if (Object.keys(managed).length) writeFileSync(manifest, JSON.stringify({ version: 1, files: managed }, null, 2) + '\n');
      else unlinkSync(manifest);
    }
    return { mode: options.apply ? 'applied' : 'dry-run', operation: 'uninstall', project, plan, note: 'Only unchanged installer-owned files are removed. Directories and runtime/output files remain.' };
  }

  const skillDir = [join(scriptDir, '..', 'assets', 'skill'), join(scriptDir, '..', 'skills', 'blender-agent')].find((p) => existsSync(join(p, 'SKILL.md')));
  if (!skillDir) throw new Error('Bundled skills/blender-agent or assets/skill is missing');
  const cli = options.cli ? resolve(options.cli) : [join(scriptDir, '..', 'dist', 'cli.js'), join(scriptDir, '..', 'packages', 'blender-agent', 'dist', 'cli.js')].find(existsSync);
  if (!cli || !existsSync(cli) || !lstatSync(cli).isFile()) throw new Error('Built CLI missing; build/install the adapter first, or pass --cli <absolute-cli.js>');
  const args = [resolve(cli), 'mcp', '--port', String(options.port), '--addon-port', String(options['addon-port']), '--worker-port', String(options['worker-port']), '--workdir', options.workdir];
  if (options.blender) args.push('--blender', resolve(options.blender));
  const entry = { command: process.execPath, args };
  const configs = {
    claude: JSON.stringify({ mcpServers: { 'blender-agent': entry } }, null, 2) + '\n',
    codex: `[mcp_servers.blender-agent]\ncommand = ${JSON.stringify(entry.command)}\nargs = ${JSON.stringify(args)}\nstartup_timeout_sec = 60\ntool_timeout_sec = 900\n`,
  };
  const pending = [];
  function add(name, bytes) {
    const path = projectPath(project, name);
    const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
    const hash = sha256(buffer);
    if (existsSync(path)) {
      const current = lstatSync(path).isFile() ? sha256(readFileSync(path)) : null;
      if (current === hash) plan.push({ path: name, action: 'unchanged' });
      else if (current && previous.files[name] === current) {
        // Only the exact bytes last installed by us may be replaced.
        plan.push({ path: name, action: 'update' });
        pending.push({ path, buffer, expected: current });
        managed[name] = hash;
      } else plan.push({ path: name, action: 'conflict' });
    } else {
      plan.push({ path: name, action: 'create' });
      pending.push({ path, buffer });
      managed[name] = hash;
    }
  }
  const hosts = options.host === 'both' ? ['codex', 'claude'] : [options.host];
  for (const host of hosts) {
    const destination = host === 'codex' ? '.agents/skills/blender-agent' : '.claude/skills/blender-agent';
    for (const file of filesBelow(skillDir)) add(`${destination}/${file.path}`, file.bytes);
    const configPath = host === 'codex' ? '.codex/config.toml' : '.mcp.json';
    const candidate = host === 'codex' ? '.blender-agent/config-candidates/codex.toml' : '.blender-agent/config-candidates/claude.json';
    add(candidate, configs[host]);
    const absolute = projectPath(project, configPath);
    if (existsSync(absolute) && !previous.files[configPath]) plan.push({ path: configPath, action: 'preserve-existing', mergeFrom: candidate });
    else add(configPath, configs[host]);
  }
  const conflicts = plan.filter((item) => item.action === 'conflict');
  if (conflicts.length) return { mode: 'blocked', operation: 'install', project, plan, error: 'Existing files differ; nothing written. Preserve or move them deliberately before reinstalling.' };
  // Preflight is complete before the first write. User-owned/modified bytes stay intact.
  if (options.apply) {
    for (const { path, expected } of pending) {
      if (expected && (!existsSync(path) || !lstatSync(path).isFile() || sha256(readFileSync(path)) !== expected)) throw new Error(`Managed file changed during preflight: ${path}`);
    }
    for (const { path, buffer, expected } of pending) {
      mkdirSync(dirname(path), { recursive: true });
      if (!expected) writeFileSync(path, buffer, { flag: 'wx' });
      else {
        const temporary = `${path}.blender-agent-${randomUUID()}.tmp`;
        try {
          writeFileSync(temporary, buffer, { flag: 'wx' });
          if (!lstatSync(path).isFile() || sha256(readFileSync(path)) !== expected) throw new Error(`Managed file changed before update: ${path}`);
          renameSync(temporary, path);
        } finally { if (existsSync(temporary)) unlinkSync(temporary); }
      }
    }
    const manifest = projectPath(project, manifestName);
    mkdirSync(dirname(manifest), { recursive: true });
    writeFileSync(manifest, JSON.stringify({ version: 1, files: managed }, null, 2) + '\n');
  }
  return { mode: options.apply ? 'applied' : 'dry-run', operation: 'install', project, plan, cli: portable(resolve(cli)), note: 'Project-local files only. Existing host configs require manual review/merge. Restart/reload the host, then run real acceptance.' };
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) console.log('portable-setup --project <dir> [--host both|codex|claude] [--port 9877] [--addon-port 9876] [--worker-port 9879] [--workdir <dir>] [--blender <exe>] [--cli <cli.js>] [--dry-run|--apply] [--uninstall]\nDefault: dry-run. Project-local only; upgrades unchanged installer-owned files, preserves user changes, never modifies global host configuration.');
  else {
    const result = setup(options);
    console.log(JSON.stringify(result, null, 2));
    if (result.error) process.exitCode = 1;
  }
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error.message }));
  process.exitCode = 1;
}
