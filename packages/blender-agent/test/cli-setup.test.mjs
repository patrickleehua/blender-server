import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const pkg = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(pkg, 'dist/cli.js');
function fixture(t) {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'blender-agent CLI 中文 '));
  t.after(() => fs.rmSync(project, { recursive: true, force: true }));
  return project;
}
function run(project, ...args) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: project, encoding: 'utf8', windowsHide: true,
    // Help/setup must be usable without reading any runtime configuration.
    env: { ...process.env, DSH_BLENDER_CONFIG: path.join(project, 'nonexistent-runtime-config.json') },
  });
}

test('help subcommands work before runtime configuration is loaded', t => {
  const project = fixture(t);
  for (const args of [[], ['help'], ['--help']]) {
    const result = run(project, ...args);
    // No-args/--help are existing entrypoints and may load no runtime either.
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /install \[--project/);
  }
  for (const command of ['install', 'uninstall']) {
    const topic = run(project, 'help', command);
    assert.equal(topic.status, 0, topic.stderr);
    assert.match(topic.stdout, /default: current directory/);
    assert.match(topic.stdout, /Preview only/);
    for (const flag of ['--help', '-h']) assert.equal(run(project, command, flag).stdout, topic.stdout);
  }
  assert.equal(run(project, 'help', 'unknown-topic').status, 1);
  assert.deepEqual(fs.readdirSync(project), []);
});

test('install/uninstall use the bundled installer, stable package path and current project', t => {
  const project = fixture(t);
  const flags = ['--port=24877', '--addon-port', '24876', '--worker-port', '24879', '--blender', path.join(project, 'Blender 程序/blender.exe')];
  const preview = run(project, 'install', ...flags);
  assert.equal(preview.status, 0, preview.stderr);
  assert.equal(JSON.parse(preview.stdout).mode, 'dry-run');
  assert.deepEqual(fs.readdirSync(project), []);
  const applied = run(project, 'install', ...flags, '--apply');
  assert.equal(applied.status, 0, applied.stderr);
  assert.equal(JSON.parse(applied.stdout).mode, 'applied');
  const config = JSON.parse(fs.readFileSync(path.join(project, '.mcp.json'), 'utf8')).mcpServers['blender-agent'];
  assert.equal(config.command, process.execPath);
  assert.deepEqual(config.args, [cli, 'mcp', '--port', '24877', '--addon-port', '24876', '--worker-port', '24879', '--workdir', path.join(project, '.blender-agent/runtime'), '--blender', path.join(project, 'Blender 程序/blender.exe')]);
  for (const name of ['.codex/config.toml', '.agents/skills/blender-agent/SKILL.md', '.claude/skills/blender-agent/SKILL.md']) assert(fs.existsSync(path.join(project, name)), name);
  assert.equal(fs.readFileSync(path.join(project, '.agents/skills/blender-agent/SKILL.md'), 'utf8'), fs.readFileSync(path.join(pkg, 'assets/skill/SKILL.md'), 'utf8'));
  const changed = path.join(project, '.agents/skills/blender-agent/SKILL.md');
  fs.writeFileSync(changed, 'user edits');
  const output = path.join(project, 'keep.blend');
  fs.writeFileSync(output, 'model output');
  const removePreview = run(project, 'uninstall');
  assert.equal(removePreview.status, 0, removePreview.stderr);
  assert.equal(JSON.parse(removePreview.stdout).mode, 'dry-run');
  assert(fs.existsSync(path.join(project, '.mcp.json')));
  const removed = run(project, 'uninstall', '--apply');
  assert.equal(removed.status, 0, removed.stderr);
  assert.equal(JSON.parse(removed.stdout).operation, 'uninstall');
  assert(!fs.existsSync(path.join(project, '.mcp.json')));
  assert.equal(fs.readFileSync(changed, 'utf8'), 'user edits');
  assert.equal(fs.readFileSync(output, 'utf8'), 'model output');
});

test('explicit project/host preserve existing config and propagate installer conflict exit codes', t => {
  const cwd = fixture(t);
  const project = path.join(cwd, '目标 空格');
  fs.mkdirSync(project);
  const original = '{"mcpServers":{"user-owned":{"command":"keep"}}}\n';
  fs.writeFileSync(path.join(project, '.mcp.json'), original);
  const args = ['--project', project, '--host', 'claude', '--apply'];
  assert.equal(run(cwd, 'install', ...args).status, 0);
  assert.equal(fs.readFileSync(path.join(project, '.mcp.json'), 'utf8'), original);
  assert(!fs.existsSync(path.join(project, '.agents')));
  assert(fs.existsSync(path.join(project, '.blender-agent/config-candidates/claude.json')));
  fs.writeFileSync(path.join(project, '.claude/skills/blender-agent/SKILL.md'), 'edited skill');
  const conflict = run(cwd, 'install', ...args);
  assert.equal(conflict.status, 1, conflict.stderr);
  assert.equal(JSON.parse(conflict.stdout).mode, 'blocked');
  assert.equal(fs.readFileSync(path.join(project, '.mcp.json'), 'utf8'), original);
  assert.deepEqual(fs.readdirSync(cwd), ['目标 空格']);
});

test('invalid setup arguments fail before writing any files', t => {
  const project = fixture(t);
  for (const args of [
    ['install', '--apply', '--dry-run'], ['install', '--port', '9876', '--apply'],
    ['install', '--project'], ['install', '--host', 'unknown', '--apply'],
    ['install', '--projet', project, '--apply'], ['install', 'unexpected', '--apply'],
    ['uninstall', '--host', 'claude', '--apply'],
  ]) {
    const result = run(project, ...args);
    assert.equal(result.status, 1, JSON.stringify({ args, stdout: result.stdout, stderr: result.stderr }));
    assert.deepEqual(fs.readdirSync(project), []);
  }
});
