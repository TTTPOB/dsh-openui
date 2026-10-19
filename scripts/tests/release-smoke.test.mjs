import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
for (const [name, mutate, expected] of [
  ['missing skill resource', dir => rm(join(dir, 'dist/openui-skill.md')), /ENOENT.*openui-skill/s],
  ['island external React import', dir => writeFile(join(dir, 'dist/island.js'), 'import "react"; export function mount() {}'), /Unbundled island import: react/],
  ['client external React require', dir => writeFile(join(dir, 'dist/client.js'), 'window.__ModuleLoader__.load({id: "dsh-openui", factory: require => require("react")})'), /Unbundled client import: react/],
]) {
  test('release smoke rejects ' + name, async () => {
    await mkdir(join(root, '.artifacts'), { recursive: true });
    const temp = await mkdtemp(join(root, '.artifacts/release-test-'));
    try {
      for (const path of ['package.json', 'dist']) {
        await cp(join(root, 'packages/dsh-openui', path), join(temp, path), { recursive: true });
      }
      await mutate(temp);
      const result = spawnSync(process.execPath, ['--experimental-vm-modules', join(root, 'scripts/release-smoke.mjs'), temp], { encoding: 'utf8' });
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, expected);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });
}
