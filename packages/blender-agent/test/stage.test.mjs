import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

test('staging removes stale generated skill and preserves unrelated asset directories', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'blender-agent-stage-'));
  const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../scripts/stage.mjs');
  const pkg = path.join(temporary, 'packages/blender-agent');
  const put = (name, bytes) => { const target = path.join(temporary, name); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes); };
  try {
    put('packages/blender-agent/scripts/stage.mjs', fs.readFileSync(source));
    put('bridge/runtime/server.mjs', '// fixture engine');
    put('bridge/runtime/.npmignore', '# npm excludes this control file itself');
    put('bridge/addon/addon.py', '# fixture addon');
    put('bridge/package.json', JSON.stringify({ name: 'fixture-engine', version: '1.0.0', license: 'BSD-3-Clause' }));
    put('skills/blender-agent/SKILL.md', 'current skill');
    put('packages/blender-agent/assets/skills/blender-agent/SKILL.md', 'stale generated skill');
    put('packages/blender-agent/assets/skills/user-other/keep.txt', 'unrelated user directory');
    put('packages/blender-agent/assets/user-data/keep.txt', 'unrelated asset');
    put('packages/blender-agent/contracts/tools.json', JSON.stringify(Array.from({ length: 15 }, (_, n) => ({ name: `fixture-${n}` }))));
    put('packages/blender-agent/contracts/plan-routing.mjs', '// fixture routing');
    put('packages/blender-agent/src/backend-service.ts', '// adapter v1');
    const result = spawnSync(process.execPath, [path.join(pkg, 'scripts/stage.mjs')], { encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.existsSync(path.join(pkg, 'assets/skills/blender-agent')), false);
    assert.equal(fs.existsSync(path.join(pkg, 'assets/runtime/.npmignore')), false, 'Manifest must not claim npm-omitted control files as installed runtime assets');
    assert.equal(fs.readFileSync(path.join(pkg, 'assets/skill/SKILL.md'), 'utf8'), 'current skill');
    assert.equal(fs.readFileSync(path.join(pkg, 'assets/skills/user-other/keep.txt'), 'utf8'), 'unrelated user directory');
    assert.equal(fs.readFileSync(path.join(pkg, 'assets/user-data/keep.txt'), 'utf8'), 'unrelated asset');
    const original = JSON.parse(fs.readFileSync(path.join(pkg, 'assets/manifest.json'), 'utf8'));
    put('packages/blender-agent/src/backend-service.ts', '// adapter v2');
    const rebuilt = spawnSync(process.execPath, [path.join(pkg, 'scripts/stage.mjs')], { encoding: 'utf8', windowsHide: true });
    assert.equal(rebuilt.status, 0, rebuilt.stderr);
    const changed = JSON.parse(fs.readFileSync(path.join(pkg, 'assets/manifest.json'), 'utf8'));
    assert.notEqual(changed.fingerprint, original.fingerprint, 'Adapter-only changes must invalidate a running backend');
    assert.deepEqual(changed.files, original.files, 'Runtime assets were not changed by the fixture');
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});
