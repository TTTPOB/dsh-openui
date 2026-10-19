import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const out = process.env.OPENUI_OUT_DIR ?? 'dist';
const { library } = await import(new URL('../' + out + '/catalog.mjs', import.meta.url));
const functions = library.functions;
const call = (name, args) => functions[name].fn(args);
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < Math.max(1, Math.abs(expected)) * 1e-12, actual + ' != ' + expected);
const cases = [
  ['round', { x: 1.005, digits: 2 }, 1.01],
  ['floor', { x: -1.2 }, -2], ['ceil', { x: -1.2 }, -1], ['abs', { x: -3 }, 3],
  ['min', { values: [3, -2, 4] }, -2], ['max', { values: [3, -2, 4] }, 4],
  ['clamp', { x: 12, lower: 0, upper: 10 }, 10], ['pow', { x: 2, exponent: 3 }, 8],
  ['sqrt', { x: 9 }, 3], ['log', { x: Math.E }, 1], ['exp', { x: 1 }, Math.E],
  ['sum', { values: [1, 2, 3] }, 6], ['mean', { values: [2, 4, 6] }, 4],
  ['median', { values: [5, 1, 3, 9] }, 4], ['count', { values: [1, 'x', null, {}] }, 4],
  ['pmt', { rate: 0.01, n: 12, pv: 1200 }, -106.61854641401006],
  ['fv', { rate: 0.01, n: 12, payment: -100, pv: -1000 }, 2395.075331451666],
  ['npv', { rate: 0.1, cashflows: [100, 100] }, 173.55371900826447],
  ['fixed', { x: -1.005, digits: 2 }, '-1.01'],
  ['percent', { x: 0.125, digits: 1 }, '12.5%'],
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
    ['round', { x: 2, digits: 16 }], ['fixed', { x: 2, digits: -1 }],
    ['sqrt', { x: -1 }], ['log', { x: 0 }], ['pow', { x: -2, exponent: 0.5 }],
    ['exp', { x: 1000 }], ['sum', { values: [1e308, 1e308] }],
    ['clamp', { x: 1, lower: 2, upper: 0 }], ['min', { values: [] }],
    ['max', { values: [] }], ['mean', { values: [] }], ['median', { values: [] }],
    ['pmt', { rate: -1, n: 12, pv: 1 }], ['pmt', { rate: 0, n: 0, pv: 1 }],
    ['fv', { rate: 1, n: 2000, payment: 100 }], ['npv', { rate: -1, cashflows: [100] }],
    ['percent', { x: 1e308 }], ['thousands', { x: Infinity }],
  ]) assert.throws(() => call(name, args), name);
});
test('rounding defaults, empty list semantics and financial zero-rate conventions are explicit', () => {
  assert.equal(call('round', { x: -1.005 }), -1.01);
  assert.equal(call('fixed', { x: 3 }), '3.00');
  assert.equal(call('percent', { x: 0.125 }), '12.50%');
  assert.equal(call('count', { values: [] }), 0);
  assert.equal(call('sum', { values: [] }), 0);
  assert.equal(call('npv', { rate: 0, cashflows: [] }), 0);
  assert.equal(call('pmt', { rate: 0, n: 12, pv: 1200 }), -100);
  close(call('pmt', { rate: 1e-20, n: 12, pv: 1200 }), -100);
  assert.equal(call('fv', { rate: 0, n: 12, payment: -100 }), 1200);
  assert.equal(call('fv', { rate: 0, n: 0, payment: -100, pv: -1000 }), 1000);
  assert.equal(call('npv', { rate: 0, cashflows: [100, 200] }), 300);
  assert.equal(call('median', { values: [9, 1, 5] }), 5);
});
test('schema is pure JSON with all function metadata and no callable implementation', async () => {
  const schema = JSON.parse(await readFile(new URL('../' + out + '/library.schema.json', import.meta.url), 'utf8'));
  assert.deepEqual(Object.keys(schema.functions).sort(), Object.keys(functions).sort());
  assert.equal(Object.keys(functions).length, 21);
  assert.ok(schema.$defs.Card);
  assert.ok(schema.functions.pmt.params.properties.rate);
  assert.equal('fn' in schema.functions.pmt, false);
  assert.equal('actions' in schema, false);
});
