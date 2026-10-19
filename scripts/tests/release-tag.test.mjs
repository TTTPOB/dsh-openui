import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertReleaseTag } from '../release-tag.mjs';

test('release accepts only the exact stable package version tag', () => {
  assert.doesNotThrow(() => assertReleaseTag('v0.1.0', '0.1.0'));
  for (const tag of ['v0.1.1', '0.1.0', 'v0.1.0-rc.1', 'v01.1.0', 'main', undefined]) {
    assert.throws(() => assertReleaseTag(tag, '0.1.0'));
  }
});
