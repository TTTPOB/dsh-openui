import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const out = process.env.OPENUI_OUT_DIR ?? 'dist';
const { library } = await import(new URL('../' + out + '/catalog.mjs', import.meta.url));
const functions = library.functions;
const call = (name, args) => functions[name].fn(args);
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < Math.max(1, Math.abs(expected)) * 1e-12, actual + ' != ' + expected);
const cases = [
  ['clamp', { x: 12, lower: 0, upper: 10 }, 10], ['pow', { x: 2, exponent: 3 }, 8],
  ['sqrt', { x: 9 }, 3], ['log', { x: Math.E }, 1], ['exp', { x: 1 }, Math.E],
  ['median', { values: [5, 1, 3, 9] }, 4],
  ['fixed', { x: -1.005, digits: 2 }, '-1.01'],
  ['thousands', { x: 1234567.89 }, '1,234,567.89'],
];
for (const [name, args, expected] of cases) test(name + ' is a registered pure function with checked output', () => {
  const before = JSON.stringify(args), actual = call(name, args);
  if (typeof expected === 'number') close(actual, expected); else assert.equal(actual, expected);
  assert.equal(JSON.stringify(args), before);
  assert.throws(() => call(name, { ...args, [Object.keys(args)[0]]: null }));
});
test('domain errors and non-finite results never silently return NaN/Infinity', () => {
  for (const [name, args] of [
    ['fixed', { x: 2, digits: -1 }], ['fixed', { x: 2, digits: 16 }],
    ['sqrt', { x: -1 }], ['log', { x: 0 }], ['pow', { x: -2, exponent: 0.5 }],
    ['exp', { x: 1000 }], ['clamp', { x: 1, lower: 2, upper: 0 }],
    ['median', { values: [] }], ['thousands', { x: Infinity }],
  ]) assert.throws(() => call(name, args), name);
});
test('format defaults and median odd/even list semantics are explicit', () => {
  assert.equal(call('fixed', { x: 3 }), '3.00');
  assert.equal(call('fixed', { x: 1.005, digits: 2 }), '1.01');
  assert.equal(call('median', { values: [9, 1, 5] }), 5);
});
test('schema exports only unique extensions as pure function metadata', async () => {
  const schema = JSON.parse(await readFile(new URL('../' + out + '/library.schema.json', import.meta.url), 'utf8'));
  assert.deepEqual(Object.keys(schema.functions).sort(), ['clamp', 'exp', 'fixed', 'log', 'median', 'pow', 'sqrt', 'thousands']);
  assert.ok(schema.$defs.Card);
  assert.ok(schema.functions.clamp.params.properties.lower);
  assert.equal('fn' in schema.functions.clamp, false);
  assert.equal('actions' in schema, false);
});
test('prompt exposes builtin capabilities once without duplicate custom aliases', async () => {
  const prompt = await readFile(new URL('../' + out + '/prompt.md', import.meta.url), 'utf8');
  const names = [...prompt.matchAll(/^@([A-Za-z]+)\(/gm)].map(match => match[1]);
  assert.equal(new Set(names.map(name => name.toLowerCase())).size, names.length);
  for (const name of ['Count', 'Sum', 'Avg', 'Min', 'Max', 'Round', 'Abs', 'Floor', 'Ceil', ...Object.keys(functions)]) assert.ok(names.includes(name), name);
});
