import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { assertReleaseTag } from './release-tag.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const pkgDir = join(root, 'packages/dsh-openui');
const pkg = JSON.parse(await readFile(join(pkgDir, 'package.json'), 'utf8'));
assertReleaseTag(process.env.GITHUB_REF_NAME ?? 'v' + pkg.version, pkg.version);
const out = join(root, '.artifacts/release');
await mkdir(out, { recursive: true });
execFileSync('pnpm', ['pack', '--pack-destination', out], { cwd: pkgDir, stdio: 'inherit' });
const asset = 'dsh-openui-' + pkg.version + '.tgz';
const tarball = join(out, asset);
const temp = await mkdtemp(join(root, '.artifacts/verify-'));
try {
  execFileSync('tar', ['-xzf', tarball, '-C', temp]);
  const packedDir = join(temp, 'package');
  const packed = JSON.parse(await readFile(join(packedDir, 'package.json'), 'utf8'));
  assert.equal(packed.name, 'dsh-openui');
  assert.equal(packed.version, pkg.version);
  for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    assert.equal(Object.keys(packed[field] ?? {}).length, 0, 'Runtime dependencies must be bundled: ' + field);
  }
  for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies', 'devDependencies']) {
    for (const spec of Object.values(packed[field] ?? {})) {
      assert.doesNotMatch(spec, /(?:workspace:|link:|file:|^\/|^[A-Z]:\\)/i, 'Local dependency in packed manifest');
    }
  }
  const required = ['index.js', 'client.js', 'island.js', 'library.schema.json', 'openui-skill.md'];
  for (const name of required) assert.ok((await readFile(join(packedDir, 'dist', name))).length, name);
  assert.equal(await readFile(join(packedDir, packed.dsh.bundle.patch), 'utf8'), '- insert:\n    - id: dsh-openui\n      name: dsh-openui\n');
  for (const name of await readdir(join(packedDir, 'dist'))) {
    const text = await readFile(join(packedDir, 'dist', name), 'utf8');
    assert.ok(!text.includes(root), 'Workspace path leaked into ' + name);
    assert.doesNotMatch(text, /(?:\/home\/[^\s"']+|\/Users\/[^\s"']+)/, 'Local home path in ' + name);
  }
  const installDir = join(temp, 'install');
  await mkdir(installDir);
  await writeFile(join(installDir, 'package.json'), JSON.stringify({ private: true, dependencies: { 'dsh-openui': 'file:' + tarball } }));
  execFileSync('pnpm', ['install', '--ignore-workspace', '--offline', '--prod', '--ignore-scripts', '--lockfile=false'], { cwd: installDir, stdio: 'inherit' });
  const installedDir = await realpath(join(installDir, 'node_modules/dsh-openui'));
  execFileSync(process.execPath, ['--experimental-vm-modules', join(root, 'scripts/release-smoke.mjs'), resolve(installedDir)], { cwd: installDir, stdio: 'inherit' });
  const hash = createHash('sha256').update(await readFile(tarball)).digest('hex');
  await writeFile(join(out, 'SHA256SUMS'), hash + '  ' + asset + '\n');
  console.log('Verified self-contained release:', tarball);
} finally {
  await rm(temp, { recursive: true, force: true });
}
