import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
const dir = await mkdtemp(new URL('../.host-test-', import.meta.url).pathname);
try {
  await build({ entryPoints: [new URL('../src/index.ts', import.meta.url).pathname], outfile: join(dir, 'index.mjs'), bundle: true, platform: 'node', format: 'esm' });
  await writeFile(join(dir, 'island.js'), 'export function mount() {}');
  await writeFile(join(dir, 'openui-skill.md'), '# OpenUI skill syntax');
  const { apply, ISLAND_PATH } = await import(join(dir, 'index.mjs'));
  let route; let policy; let skill; let cleaned = 0; const cleanups = [];
  apply({ inject(services, callback) { callback({ effect(install) { cleanups.push(install()); }, systemPrompt: { section(value) { policy = value; return () => cleaned++; } }, skills: { register(value) { skill = value; return () => cleaned++; } }, webServer: { register(value) { route = value; return () => { cleaned++; }; } } }); } });
  function request(method, headers = {}) {
    const result = {}; route.handler({ method, headers }, { writeHead(status, headers) { result.status = status; result.headers = headers; }, end(body) { result.body = body; } }); return result;
  }
  test('island asset route supports GET, HEAD, ETag and disposal', () => {
    assert.equal(route.path, ISLAND_PATH);
    const get = request('GET'); assert.equal(get.status, 200); assert.match(get.body.toString(), /export function mount/);
    assert.equal(request('HEAD').body, undefined);
    assert.equal(request('GET', { 'if-none-match': get.headers.ETag }).status, 304);
    assert.equal(request('POST').status, 405);
    assert.equal(skill.name, 'openui'); assert.equal(skill.content, '# OpenUI skill syntax');
    assert.equal(skill.invocation.modelInvocable, true); assert.equal(skill.invocation.userInvocable, false);
    assert.match(policy.text, /load the openui skill/); assert.ok(policy.text.length < 600); assert.equal(policy.text.includes('Slider('), false);
    cleanups.forEach(cleanup => cleanup()); assert.equal(cleaned, 3);
  });
} finally { await rm(dir, { recursive: true, force: true }); }
