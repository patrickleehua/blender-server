#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destination = path.join(repo, 'release');
const npm = process.env.npm_execpath;
if (!npm || !fs.existsSync(npm)) throw new Error('Run this command through npm run pack');
fs.mkdirSync(destination, { recursive: true });
const result = spawnSync(process.execPath, [npm, 'pack', '--json', '--pack-destination', destination], {
  cwd: path.join(repo, 'packages', 'blender-agent'), encoding: 'utf8', windowsHide: true,
});
if (result.stderr) process.stderr.write(result.stderr);
if (result.status !== 0) throw new Error(`npm pack failed (${result.status})`);
const packed = JSON.parse(result.stdout);
const [item] = packed;
const forbidden = item.files.filter(f => /(^|\/)(node_modules|\.git|\.upstream|\.local|venv|__pycache__)(\/|$)|\.pyc$/.test(f.path));
if (forbidden.length) throw new Error('Package contains local/third-party environment residue');
for (const required of ['dist/cli.js', 'assets/runtime/server.mjs', 'assets/addon/dsh_blender_bridge.py',
  'assets/skill/SKILL.md', 'scripts/portable-setup.mjs', 'LICENSE']) {
  if (!item.files.some(f => f.path === required)) throw new Error(`Missing product asset: ${required}`);
}
const tarball = path.join(destination, item.filename);
const sha256 = createHash('sha256').update(fs.readFileSync(tarball)).digest('hex');
const revision = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8', windowsHide: true });
const dirty = spawnSync('git', ['diff', '--quiet', 'HEAD', '--', 'bridge', 'packages', 'skills', 'scripts'], { cwd: repo, windowsHide: true });
const manifest = { name: item.name, version: item.version, filename: item.filename,
  sha256, size: item.size, unpackedSize: item.unpackedSize, entryCount: item.entryCount,
  sourceCommit: revision.status === 0 ? revision.stdout.trim() : null,
  sourceDirty: dirty.status !== 0,
  assetFingerprint: JSON.parse(fs.readFileSync(path.join(repo, 'packages', 'blender-agent', 'assets', 'manifest.json'), 'utf8')).fingerprint,
  files: item.files.map(f => ({ path: f.path, size: f.size })) };
fs.writeFileSync(path.join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
process.stdout.write(JSON.stringify({ tarball, sha256, files: item.entryCount, size: item.size }) + '\n');
