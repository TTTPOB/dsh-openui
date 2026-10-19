import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const built = await build({ entryPoints: [new URL('../src/discovery.ts', import.meta.url).pathname], bundle: true, write: false, format: 'esm' });
const { parseFences, findFences } = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));

test('parse language, CRLF, longer delimiters and unfinished stream', () => {
  assert.deepEqual(parseFences('```javascript\r\nlet x = 1\r\n```\r\n~~~openui-lang title\r\nroot = Card("X", [])\r\n~~~'), [{ language: 'javascript', body: 'let x = 1' }, { language: 'openui-lang', body: 'root = Card("X", [])' }]);
  assert.equal(parseFences('````markdown\n```openui-lang\nbody\n```\n````').length, 1);
  assert.deepEqual(parseFences('```openui-lang\npartial'), [{ language: 'openui-lang', body: 'partial' }]);
  assert.deepEqual(parseFences('// openui-lang\nroot = Card("X", [])'), []);
});

test('match node key and body, keep duplicate islands distinct from normal code', () => {
  const body = 'root = Card("X", [])';
  const blocks = [0, 1, 2].map(() => ({ querySelector: () => ({ textContent: body }), hidden: false }));
  const row = { dataset: { chatNodeKey: 'node1' }, hasAttribute: () => false, closest: () => null, querySelectorAll: () => blocks };
  const container = { querySelectorAll: () => [row] };
  const text = ['```javascript', body, '```', '```openui-lang', body, '```', '```openui-lang', body, '```'].join('\n');
  const snapshot = { nodes: { values: () => [{ key: 'node1', kind: 'assistant-step', visibility: 'visible', data: { blocks: [{ kind: 'text', text }], status: 'running' } }] } };
  const found = findFences(container, 'session1', snapshot);
  assert.equal(found.length, 2); assert.equal(found[0].original, blocks[1]); assert.equal(found[1].original, blocks[2]);
  assert.equal(found[0].streaming, true); assert.notEqual(found[0].stateKey, found[1].stateKey);
  assert.deepEqual(findFences(container, 'session1'), []);
  row.dataset.chatNodeKey = 'different'; assert.deepEqual(findFences(container, 'session1', snapshot), []);
});
