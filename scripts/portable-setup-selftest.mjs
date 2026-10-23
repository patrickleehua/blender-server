#!/usr/bin/env node
// Installer filesystem checks only; does not substitute for real Blender/host acceptance.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, cpSync, readdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const setup = join(scriptsDir, 'portable-setup.mjs');
const skill = resolve(scriptsDir, '../skills/blender-agent');
const base = mkdtempSync(join(tmpdir(), 'blender-agent-setup-test-'));
let passed = 0;
const cli = join(base, 'fixture-cli.js');
writeFileSync(cli, '// Fixture path only. Installer does not execute the CLI.\n');
function project(name) { const path = join(base, name); mkdirSync(path); return path; }
function run(target, args = [], script = setup) {
  const output = spawnSync(process.execPath, [script, '--project', target, '--cli', cli, ...args], { encoding: 'utf8' });
  const json = JSON.parse(output.stdout || output.stderr);
  return { status: output.status, json };
}
function check(name, test) { test(); passed++; console.log(`PASS ${name}`); }
function packageFixture(name) {
  const pkg = join(base, name);
  mkdirSync(join(pkg, 'scripts'), { recursive: true });
  cpSync(setup, join(pkg, 'scripts/portable-setup.mjs'));
  cpSync(skill, join(pkg, 'assets/skill'), { recursive: true });
  return { script: join(pkg, 'scripts/portable-setup.mjs'), skill: join(pkg, 'assets/skill/SKILL.md') };
}
function snapshot(directory, prefix = '') {
  return Object.fromEntries(readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    const path = join(directory, entry.name);
    return entry.isDirectory() ? Object.entries(snapshot(path, name)) : [[name, readFileSync(path).toString('base64')]];
  }));
}
try {
  check('dry-run does not create any project files', () => {
    const target = project('preview');
    const result = run(target, ['--dry-run']);
    assert.equal(result.status, 0);
    assert.equal(result.json.mode, 'dry-run');
    assert.deepEqual(readdirSync(target), []);
  });
  check('install produces both host configs and supports repeat install', () => {
    const target = project('install');
    assert.equal(run(target, ['--apply']).status, 0);
    const result = run(target, ['--apply']);
    assert.equal(result.status, 0);
    assert(result.json.plan.every((item) => item.action === 'unchanged'));
    assert(existsSync(join(target, '.agents/skills/blender-agent/SKILL.md')));
    assert(existsSync(join(target, '.claude/skills/blender-agent/SKILL.md')));
    const config = JSON.parse(readFileSync(join(target, '.mcp.json'), 'utf8'));
    assert.equal(config.mcpServers['blender-agent'].command, process.execPath);
    assert(config.mcpServers['blender-agent'].args.includes(cli));
    assert(config.mcpServers['blender-agent'].args.includes(join(target, '.blender-agent/runtime')));
  });
  check('existing host configuration is byte-for-byte preserved', () => {
    const target = project('existing-config');
    const original = '{"mcpServers":{"existing":{"command":"keep"}}}\n';
    writeFileSync(join(target, '.mcp.json'), original);
    assert.equal(run(target, ['--host', 'claude', '--apply']).status, 0);
    assert.equal(readFileSync(join(target, '.mcp.json'), 'utf8'), original);
    assert(existsSync(join(target, '.blender-agent/config-candidates/claude.json')));
  });
  check('three explicit isolated ports survive configuration generation', () => {
    const target = project('ports');
    assert.equal(run(target, ['--host', 'claude', '--port', '21877', '--addon-port', '21876', '--worker-port', '21879', '--apply']).status, 0);
    const config = JSON.parse(readFileSync(join(target, '.mcp.json'), 'utf8'));
    const args = config.mcpServers['blender-agent'].args;
    assert.equal(args[args.indexOf('--port') + 1], '21877');
    assert.equal(args[args.indexOf('--addon-port') + 1], '21876');
    assert.equal(args[args.indexOf('--worker-port') + 1], '21879');
    const bad = project('same-ports');
    assert.equal(run(bad, ['--port', '9876', '--apply']).status, 1);
    assert.deepEqual(readdirSync(bad), []);
  });
  check('skill conflicts block before writing any new files', () => {
    const target = project('conflict');
    mkdirSync(join(target, '.claude/skills/blender-agent'), { recursive: true });
    const path = join(target, '.claude/skills/blender-agent/SKILL.md');
    writeFileSync(path, 'user skill\n');
    const result = run(target, ['--apply']);
    assert.equal(result.status, 1);
    assert.equal(result.json.mode, 'blocked');
    assert.equal(readFileSync(path, 'utf8'), 'user skill\n');
    assert(!existsSync(join(target, '.agents')));
    assert(!existsSync(join(target, '.blender-agent')));
    assert(!existsSync(join(target, '.mcp.json')));
  });
  check('uninstall keeps modified files and runtime outputs', () => {
    const target = project('uninstall');
    assert.equal(run(target, ['--host', 'codex', '--apply']).status, 0);
    const changed = join(target, '.agents/skills/blender-agent/SKILL.md');
    writeFileSync(changed, 'locally changed\n');
    const runtime = join(target, '.blender-agent/runtime');
    mkdirSync(runtime, { recursive: true });
    writeFileSync(join(runtime, 'keep.blend'), 'user output');
    const preview = run(target, ['--uninstall', '--dry-run']);
    assert.equal(preview.status, 0);
    assert(existsSync(join(target, '.codex/config.toml')));
    const result = run(target, ['--uninstall', '--apply']);
    assert.equal(result.status, 0);
    assert(!existsSync(join(target, '.codex/config.toml')));
    assert.equal(readFileSync(changed, 'utf8'), 'locally changed\n');
    assert.equal(readFileSync(join(runtime, 'keep.blend'), 'utf8'), 'user output');
    assert(result.json.plan.some((item) => item.action === 'preserve-modified'));
  });
  check('pre-existing identical skill is not claimed for uninstall', () => {
    const target = project('preexisting-skill');
    const destination = join(target, '.agents/skills/blender-agent');
    cpSync(skill, destination, { recursive: true });
    assert.equal(run(target, ['--host', 'codex', '--apply']).status, 0);
    assert.equal(run(target, ['--uninstall', '--apply']).status, 0);
    assert(existsSync(join(destination, 'SKILL.md')));
  });
  check('upgrade replaces only unchanged managed files and refreshes uninstall hashes', () => {
    const pkg = packageFixture('upgrade-package');
    const target = project('upgrade-unchanged');
    assert.equal(run(target, ['--apply'], pkg.script).status, 0);
    const upgraded = readFileSync(pkg.skill, 'utf8') + '\n<!-- next package version -->\n';
    writeFileSync(pkg.skill, upgraded);
    const before = snapshot(target);
    const preview = run(target, ['--port', '23877', '--dry-run'], pkg.script);
    assert.equal(preview.status, 0);
    assert(preview.json.plan.some(item => item.action === 'update'));
    assert.deepEqual(snapshot(target), before);
    const applied = run(target, ['--port', '23877', '--apply'], pkg.script);
    assert.equal(applied.status, 0);
    for (const host of ['.agents', '.claude']) assert.equal(readFileSync(join(target, host, 'skills/blender-agent/SKILL.md'), 'utf8'), upgraded);
    assert(JSON.parse(readFileSync(join(target, '.mcp.json'), 'utf8')).mcpServers['blender-agent'].args.includes('23877'));
    assert(readFileSync(join(target, '.codex/config.toml'), 'utf8').includes('23877'));
    assert.equal(run(target, ['--port', '23877', '--apply'], pkg.script).status, 0);
    assert.equal(run(target, ['--uninstall', '--apply'], pkg.script).status, 0);
    assert(!existsSync(join(target, '.agents/skills/blender-agent/SKILL.md')));
    assert(!existsSync(join(target, '.mcp.json')));
  });
  check('upgrade conflict preserves user skill edits and writes nothing', () => {
    const pkg = packageFixture('edited-upgrade-package');
    const target = project('upgrade-edited');
    assert.equal(run(target, ['--apply'], pkg.script).status, 0);
    writeFileSync(pkg.skill, readFileSync(pkg.skill, 'utf8') + '\nnew package revision\n');
    writeFileSync(join(target, '.agents/skills/blender-agent/SKILL.md'), 'user-customized skill\n');
    const before = snapshot(target);
    const result = run(target, ['--port', '24877', '--apply'], pkg.script);
    assert.equal(result.status, 1);
    assert.equal(result.json.mode, 'blocked');
    assert.deepEqual(snapshot(target), before);
  });
  check('upgrade preserves other servers and settings added to installer-owned host configs', () => {
    const target = project('upgrade-host-settings');
    assert.equal(run(target, ['--apply']).status, 0);
    const claude = join(target, '.mcp.json');
    const config = JSON.parse(readFileSync(claude, 'utf8'));
    config.mcpServers.other = { command: 'keep-user-server' };
    writeFileSync(claude, JSON.stringify(config, null, 2));
    const codex = join(target, '.codex/config.toml');
    writeFileSync(codex, readFileSync(codex, 'utf8') + '\n[mcp_servers.other]\ncommand = "keep-other"\n');
    const before = snapshot(target);
    const result = run(target, ['--port', '25877', '--apply']);
    assert.equal(result.status, 1);
    assert(result.json.plan.some(item => item.path === '.mcp.json' && item.action === 'conflict'));
    assert(result.json.plan.some(item => item.path === '.codex/config.toml' && item.action === 'conflict'));
    assert.deepEqual(snapshot(target), before);
    assert.equal(run(target, ['--uninstall', '--apply']).status, 0);
    assert.equal(readFileSync(claude, 'utf8'), Buffer.from(before['.mcp.json'], 'base64').toString());
    assert.equal(readFileSync(codex, 'utf8'), Buffer.from(before['.codex/config.toml'], 'base64').toString());
  });
  check('standalone package layout locates bundled skill and CLI', () => {
    const pkg = join(base, 'standalone');
    mkdirSync(join(pkg, 'scripts'), { recursive: true });
    mkdirSync(join(pkg, 'dist'));
    cpSync(setup, join(pkg, 'scripts/portable-setup.mjs'));
    cpSync(skill, join(pkg, 'assets/skill'), { recursive: true });
    writeFileSync(join(pkg, 'dist/cli.js'), '// fixture');
    const target = project('consumer');
    const output = spawnSync(process.execPath, [join(pkg, 'scripts/portable-setup.mjs'), '--project', target, '--host', 'claude', '--apply'], { encoding: 'utf8' });
    assert.equal(output.status, 0, output.stderr);
    const config = JSON.parse(readFileSync(join(target, '.mcp.json'), 'utf8'));
    assert.equal(config.mcpServers['blender-agent'].args[0], join(pkg, 'dist/cli.js'));
  });
  check('manifest traversal is rejected without touching outside files', () => {
    const target = project('path-traversal');
    mkdirSync(join(target, '.blender-agent'));
    writeFileSync(join(target, '.blender-agent/install-manifest.json'), JSON.stringify({ version: 1, files: { '../fixture-cli.js': 'a'.repeat(64) } }));
    const result = run(target, ['--uninstall', '--apply']);
    assert.equal(result.status, 1);
    assert(existsSync(cli));
    assert.match(result.json.error, /outside project/);
  });
  check('symlink or junction destinations are rejected', () => {
    const target = project('symlink');
    const outside = project('outside');
    symlinkSync(outside, join(target, '.agents'), process.platform === 'win32' ? 'junction' : 'dir');
    const result = run(target, ['--apply']);
    assert.equal(result.status, 1);
    assert.match(result.json.error, /symlink\/junction/);
    assert.deepEqual(readdirSync(outside), []);
  });
  console.log(`${passed} installer checks passed. Blender and host acceptance were not run by this script.`);
} finally {
  // This absolute directory was created by mkdtempSync above, never derived from user input.
  assert(base.startsWith(join(tmpdir(), 'blender-agent-setup-test-')));
  rmSync(base, { recursive: true, force: true });
}
