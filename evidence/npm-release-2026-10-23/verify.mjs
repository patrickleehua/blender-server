import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const repo = process.cwd();
const registryMode = process.argv.includes('--registry');
const tarball = path.join(repo, 'release', JSON.parse(fs.readFileSync(path.join(repo, 'release/manifest.json'), 'utf8')).filename);
const npmEntry = process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
const packageName = '@patricklee2001/blender-agent';
const base = fs.mkdtempSync(path.join(repo, 'tmp/npm 分发 验证 '));
const prefix = path.join(base, '工具 安装');
const project = path.join(base, '模型 项目');
const evidence = path.join(repo, 'evidence/npm-release-2026-10-23', registryMode ? 'registry' : 'candidate');
fs.mkdirSync(project, { recursive: true });
fs.mkdirSync(evidence, { recursive: true });
const results = { ok: false, mode: registryMode ? 'registry' : 'candidate', tarballSha256: hash(fs.readFileSync(tarball)), base, commands: [], calls: [], node: process.version };
function hash(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function run(command, args, cwd = project) {
  const p = spawnSync(command, args, { cwd, encoding: 'utf8', windowsHide: true, timeout: 120_000, maxBuffer: 16 * 1024 * 1024 });
  results.commands.push({ command, args, status: p.status, stdout: p.stdout, stderr: p.stderr, error: p.error?.message });
  assert.equal(p.status, 0, p.stderr || p.stdout || p.error?.message);
  return p.stdout;
}
function record(value) {
  if (Array.isArray(value)) return value.map(record);
  if (value && typeof value === 'object') {
    if (value.type === 'image' && value.data) return { type: 'image', mimeType: value.mimeType, bytes: Buffer.from(value.data, 'base64').length, sha256: hash(Buffer.from(value.data, 'base64')) };
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, record(v)]));
  }
  return value;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
let client, backendPid, workerPid;
try {
  console.log('Installing ' + (registryMode ? 'from public registry' : 'local candidate') + ' with lifecycle scripts disabled');
  const emptyUserConfig = path.join(base, 'empty.npmrc');
  fs.writeFileSync(emptyUserConfig, '');
  run(process.execPath, [npmEntry, 'install', '--global', '--prefix', prefix, '--userconfig', emptyUserConfig, '--cache', path.join(base, 'npm-cache'), '--registry', 'https://registry.npmjs.org/', '--ignore-scripts', '--no-audit', '--no-fund', registryMode ? packageName + '@1.0.0' : tarball]);
  const pkg = path.join(prefix, 'node_modules', packageName);
  results.installedPackage = pkg;
  const metadata = JSON.parse(fs.readFileSync(path.join(pkg, 'package.json'), 'utf8'));
  assert(!Object.keys(metadata.scripts).some(k => ['preinstall', 'install', 'postinstall'].includes(k)));
  assert(!fs.existsSync(path.join(pkg, 'node_modules/typescript')));
  const manifest = JSON.parse(fs.readFileSync(path.join(pkg, 'assets/manifest.json'), 'utf8'));
  for (const [name, digest] of Object.entries(manifest.files)) assert.equal(hash(fs.readFileSync(path.join(pkg, 'assets', name))), digest, name);
  results.assetFingerprint = manifest.fingerprint;
  results.assetFilesVerified = Object.keys(manifest.files).length;
  if (!registryMode) run(process.execPath, [npmEntry, 'publish', tarball, '--access', 'public', '--dry-run', '--json']);
  results.publishDryRun = !registryMode;
  const shim = path.join(prefix, 'blender-agent.ps1');
  assert(fs.existsSync(shim));
  const cli = (...args) => run('pwsh.exe', ['-NoProfile', '-File', shim, ...args]);
  assert.match(cli('help'), /install \[--project/);
  assert.match(cli('help', 'install'), /default: current directory/);
  assert.match(cli('install', '--help'), /--apply/);
  assert.equal(cli('--version').trim(), '1.0.0');
  const preview = JSON.parse(cli('install'));
  assert.equal(preview.mode, 'dry-run');
  assert.deepEqual(fs.readdirSync(project), []);
  const blender = path.join(repo, '.local/blender-4.5.15-windows-x64/blender.exe');
  const ports = ['--port', '28877', '--addon-port', '28876', '--worker-port', '28879'];
  const installed = JSON.parse(cli('install', '--blender', blender, ...ports, '--apply'));
  assert.equal(installed.mode, 'applied');
  assert.equal(fs.readFileSync(path.join(project, '.agents/skills/blender-agent/SKILL.md'), 'utf8'), fs.readFileSync(path.join(pkg, 'assets/skill/SKILL.md'), 'utf8'));
  const config = JSON.parse(fs.readFileSync(path.join(project, '.mcp.json'), 'utf8')).mcpServers['blender-agent'];
  assert.equal(config.args[0], path.join(pkg, 'dist/cli.js'));
  assert(fs.existsSync(config.args[0]));
  const require = createRequire(path.join(pkg, 'package.json'));
  const { Client } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/index.js')).href);
  const { StdioClientTransport } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/stdio.js')).href);
  client = new Client({ name: 'npm-distribution-smoke', version: '1.0.0' });
  const transport = new StdioClientTransport({ ...config, stderr: 'pipe' });
  let diagnostics = '';
  transport.stderr?.on('data', data => diagnostics += data.toString());
  await client.connect(transport);
  assert.equal((await client.listTools()).tools.length, 15);
  results.toolCount = 15;
  const call = async (name, args) => {
    const value = await client.callTool({ name, arguments: args }, undefined, { timeout: 120_000 });
    results.calls.push({ name, args, result: record(value) });
    assert.equal(value.isError, false, JSON.stringify(record(value)));
    return value;
  };
  console.log('Generated project configuration connects to the installed package; exercising real Blender');
  await call('blender_rt_do', { session: 'npm-proof', see: false, code: 'import bpy\nbpy.ops.wm.read_factory_settings(use_empty=True)\nbpy.ops.mesh.primitive_cube_add(size=2)\nbpy.context.object.name="NpmDistributionProof"' });
  const work = path.join(project, '.blender-agent/runtime');
  backendPid = JSON.parse(fs.readFileSync(path.join(work, '.blender-agent/backend-28877.json'), 'utf8')).pid;
  const status = await call('blender_rt_worker', { op: 'status', name: 'npm-proof' });
  workerPid = status.structuredContent.result.pid;
  const seen = await call('blender_rt_see', { session: 'npm-proof', view_size: '320x180' });
  const image = seen.content.find(x => x.type === 'image');
  assert(image);
  const png = Buffer.from(image.data, 'base64');
  assert.equal(png.readUInt32BE(16), 320);
  assert.equal(png.readUInt32BE(20), 180);
  fs.writeFileSync(path.join(evidence, 'npm-smoke.png'), png);
  const blend = path.join(evidence, 'npm-smoke.blend');
  await call('blender_rt_do', { session: 'npm-proof', see: false, code: `bpy.ops.wm.save_as_mainfile(filepath=${JSON.stringify(blend)})` });
  assert(fs.statSync(blend).size > 1000);
  await client.close(); client = undefined;
  for (let i = 0; i < 100; i++) {
    let alive = false;
    try { process.kill(backendPid, 0); alive = true; } catch {}
    if (!alive) break;
    await sleep(50);
  }
  assert.throws(() => process.kill(backendPid, 0));
  assert.throws(() => process.kill(workerPid, 0));
  results.cleanupVerified = true;
  results.mcpDiagnostics = diagnostics;
  run(blender, ['--background', '--factory-startup', blend, '--python-exit-code', '2', '--python-expr', 'import bpy; obj=bpy.data.objects["NpmDistributionProof"]; assert tuple(round(v,6) for v in obj.dimensions)==(2.0,2.0,2.0); print("NPM_BLEND_REOPEN_OK")']);
  const edited = path.join(project, '.agents/skills/blender-agent/SKILL.md');
  fs.writeFileSync(edited, 'user modified skill');
  fs.writeFileSync(path.join(project, 'keep.blend'), 'user output');
  assert.equal(JSON.parse(cli('uninstall')).mode, 'dry-run');
  assert(fs.existsSync(path.join(project, '.mcp.json')));
  assert.equal(JSON.parse(cli('uninstall', '--apply')).operation, 'uninstall');
  assert(!fs.existsSync(path.join(project, '.mcp.json')));
  assert.equal(fs.readFileSync(edited, 'utf8'), 'user modified skill');
  assert.equal(fs.readFileSync(path.join(project, 'keep.blend'), 'utf8'), 'user output');
  results.ok = true;
  console.log('PASS: installed command, project setup, MCP, Blender image/save/reopen, cleanup and protected uninstall');
} catch (error) { results.error = error.stack; process.exitCode = 1; console.error(error); }
finally {
  if (client) await client.close();
  fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify(results, null, 2) + '\n');
}
