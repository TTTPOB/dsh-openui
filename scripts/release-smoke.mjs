import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, isBuiltin } from 'node:module';
import { join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';

// Reject accidental resolution through the checkout's ancestor node_modules.
const dir = process.argv[2];
const baseURL = pathToFileURL(dir + sep).href;
registerHooks({ resolve(specifier, context, nextResolve) {
  const result = nextResolve(specifier, context);
  assert.ok(isBuiltin(specifier) || result.url.startsWith(baseURL), 'Unbundled runtime import: ' + specifier);
  return result;
} });
const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
const { apply, ISLAND_PATH } = await import(new URL(pkg.exports['.'], baseURL));
let route, skill, policy, tool;
const cleanups = [];
apply({ inject(_services, callback) { callback({
  effect(install) { cleanups.push(install()); },
  tools: { register(value) { tool = value; return () => {}; } },
  skills: { register(value) { skill = value; return () => {}; } },
  systemPrompt: { section(value) { policy = value; return () => {}; } },
  webServer: { register(value) { route = value; return () => {}; } },
}); } });
assert.equal(skill.name, 'openui');
assert.match(skill.content, /Slider/);
assert.match(policy.text, /openui/);
assert.equal(tool.execute({ source: 'root = Card("A", [Text("ok")])' }).ok, true);
assert.equal(tool.execute({ source: 'root = Unknown()' }).ok, false);
assert.equal(route.path, ISLAND_PATH);
let body;
route.handler({ method: 'GET', headers: {} }, {
  writeHead(code, headers) { assert.equal(code, 200); assert.match(headers['Content-Type'], /javascript/); },
  end(value) { body = value; },
});
const island = readFileSync(join(dir, 'dist/island.js'), 'utf8');
assert.equal(body.toString(), island);
// Linking rejects every static island dependency, including React from the host.
const module = new vm.SourceTextModule(island, {
  importModuleDynamically() { throw new Error('Island must not import runtime dependencies'); },
});
await module.link(specifier => { throw new Error('Unbundled island import: ' + specifier); });
await module.evaluate();
assert.equal(typeof module.namespace.mount, 'function');
let client;
vm.runInNewContext(readFileSync(new URL(pkg.exports['./client'], baseURL), 'utf8'), {
  window: { __ModuleLoader__: { load(value) {
    assert.equal(value.id, 'dsh-openui');
    client = value.factory(specifier => { throw new Error('Unbundled client import: ' + specifier); });
  } } },
});
assert.equal(typeof client.apply, 'function');
cleanups.forEach(cleanup => cleanup());
console.log('Installed server/tool/skill/asset, client factory and island ESM passed without external runtime dependencies');
