import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
const built = await build({ entryPoints: [new URL('../src/check.ts', import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'node' });
const { createCheck, createCheckTool } = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
const schema = JSON.parse(readFileSync(new URL('../../openui-island/dist/library.schema.json', import.meta.url), 'utf8'));
const check = createCheck(schema);
test('checker accepts the shared catalog and rejects unknown components at statement start', () => {
  assert.deepEqual(check('root = Card("A", [Text("ok")])'), { ok: true, errors: [] });
  const invalid = check('label = "A"\nroot = Card(label, [Missing(1)])');
  assert.equal(invalid.ok, false); assert.equal(invalid.errors[0].code, 'unknown-component');
  assert.equal(invalid.errors[0].line, 2); assert.match(invalid.errors[0].message, /Missing/); assert.ok(invalid.errors[0].suggestion);
});
test('incomplete and unresolved sources never return a false ok', () => {
  const truncated = check('root = Card("A", [Text(');
  assert.equal(truncated.ok, false); assert.ok(truncated.errors.some(error => error.code === 'incomplete' && error.line === null));
  const unresolved = check('root = Card("A", [Text(missing)])');
  assert.equal(unresolved.ok, false); assert.ok(unresolved.errors.some(error => error.code === 'unresolved'));
  assert.equal(check('').ok, false);
  assert.equal(check('title = Text("missing explicit root")').ok, false);
});
test('custom function signatures are accepted without running their implementations', () => {
  assert.equal(check('root = Card("A", [Text(@clamp(1.25, 0, 1))])').ok, true);
});
test('tool returns structured results and refuses non-string input', () => {
  const tool = createCheckTool(check);
  assert.equal(tool.execute({ source: 'root = Card("A", [])' }).ok, true);
  assert.equal(tool.execute({ source: 'root = Unknown()' }).ok, false);
  assert.throws(() => tool.execute({ source: 42 }), /source must be a string/);
});
