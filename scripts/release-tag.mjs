import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function assertReleaseTag(tag, version) {
  assert.match(tag ?? '', /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/, 'Release tag must be vX.Y.Z');
  assert.equal(tag, 'v' + version, 'Release tag must match dsh-openui package version');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pkg = JSON.parse(readFileSync(new URL('../packages/dsh-openui/package.json', import.meta.url)));
  assertReleaseTag(process.argv[2], pkg.version);
  console.log('Release identity verified:', pkg.name, process.argv[2]);
}
