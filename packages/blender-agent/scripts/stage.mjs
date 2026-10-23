// Build the independent package from the compatibility engine and owned contracts.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const pkg = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(pkg, '../..');
const assets = path.join(pkg, 'assets');
if (!fs.existsSync(path.join(repo, 'bridge/runtime/server.mjs'))) {
  if (!fs.existsSync(path.join(assets, 'manifest.json'))) throw new Error('Compatibility engine unavailable; build inside the project or use the published package.');
  process.exit(0);
}
fs.mkdirSync(assets, { recursive: true });
// This old generated Skill location used to survive subsequent builds and ship a
// second, stale contract. Remove only our known legacy subtree, not other assets.
const legacySkill = path.join(assets, 'skills', 'blender-agent');
for (const parent of [assets, path.dirname(legacySkill)]) {
  if (fs.existsSync(parent) && fs.lstatSync(parent).isSymbolicLink()) throw new Error(`Refusing symlink in generated assets: ${parent}`);
}
fs.rmSync(legacySkill, { recursive: true, force: true });
for (const dir of ['runtime', 'addon']) {
  const target = path.join(assets, dir);
  if (path.dirname(target) !== assets) throw new Error('Invalid staging path');
  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(path.join(repo, 'bridge', dir), target, { recursive: true, filter: (p) => path.basename(p) !== '.npmignore' && !/(?:^|[\\/])(?:venv|node_modules|__pycache__|\.git)(?:[\\/]|$)|\.pyc$|\.tgz$|\.bak-|\.v1-/.test(p) });
}
for (const name of ['LICENSE', 'NOTICE.md']) if (fs.existsSync(path.join(repo, 'bridge', name))) fs.copyFileSync(path.join(repo, 'bridge', name), path.join(assets, name));
if (fs.existsSync(path.join(repo, 'LICENSE'))) fs.copyFileSync(path.join(repo, 'LICENSE'), path.join(pkg, 'LICENSE'));
const metadata = JSON.parse(fs.readFileSync(path.join(repo, 'bridge/package.json'), 'utf8'));
fs.writeFileSync(path.join(assets, 'package.json'), JSON.stringify({ name: metadata.name, version: metadata.version, license: metadata.license }, null, 2));
const skill = path.join(repo, 'skills/blender-agent');
if (fs.existsSync(skill)) {
  fs.rmSync(path.join(assets, 'skill'), { recursive: true, force: true });
  fs.cpSync(skill, path.join(assets, 'skill'), { recursive: true });
}
const setup = path.join(repo, 'scripts/portable-setup.mjs');
if (fs.existsSync(setup)) fs.copyFileSync(setup, path.join(pkg, 'scripts/portable-setup.mjs'));
for (const file of ['tools.json', 'plan-routing.mjs']) fs.copyFileSync(path.join(pkg, 'contracts', file), path.join(assets, file));
const tools = JSON.parse(fs.readFileSync(path.join(assets, 'tools.json'), 'utf8'));
if (tools.length !== 15 || new Set(tools.map(t => t.name)).size !== 15) throw new Error('Expected 15 independent tool contracts');
const files = {};
function hashTree(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) hashTree(p);
    else files[path.relative(assets, p).replaceAll('\\', '/')] = createHash('sha256').update(fs.readFileSync(p)).digest('hex');
  }
}
hashTree(path.join(assets, 'runtime')); hashTree(path.join(assets, 'addon'));
// The HTTP service also contains adapter code. A service from an older adapter
// must not be reused just because its Blender Python modules are unchanged.
const adapterInputs = {};
for (const name of ['contracts/tools.json', 'contracts/plan-routing.mjs', ...(
  fs.existsSync(path.join(pkg, 'src')) ? fs.readdirSync(path.join(pkg, 'src')).filter(n => n.endsWith('.ts')).sort().map(n => 'src/' + n) : []
)]) adapterInputs[name] = createHash('sha256').update(fs.readFileSync(path.join(pkg, name))).digest('hex');
const fingerprint = createHash('sha256').update(JSON.stringify({ files, adapterInputs })).digest('hex');
fs.writeFileSync(path.join(assets, 'manifest.json'), JSON.stringify({ compatibilityVersion: '2.6.0', fingerprint, files, adapterInputs }, null, 2) + '\n');
console.error(`Staged ${Object.keys(files).length} engine/addon files, 15 tool schemas, fingerprint ${fingerprint.slice(0, 12)}`);
