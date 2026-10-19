import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const built = await build({ entryPoints: [new URL('../src/lifecycle.ts', import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'node' });
const { createRenderer } = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture() {
  const hosts = [];
  const doc = { documentElement: { classList: { contains: () => false } }, createElement() {
    const host = { hidden: false, removed: false, setAttribute() {}, attachShadow() { return {}; }, remove() { this.removed = true; } };
    hosts.push(host); return host;
  } };
  const original = { ownerDocument: doc, hidden: false, before() {} };
  const code = { ownerDocument: doc, textContent: 'root = Text("Hello")', isConnected: true };
  return { hosts, original, code, fence: { code, original, streaming: true } };
}
test('lazy mount, stream update and removal preserve source', async () => {
  const f = fixture(); const updates = []; let unmounted = 0; let options;
  const renderer = createRenderer(async () => ({ mount(root, opts) { options = opts; return { update: next => updates.push(next), unmount: () => unmounted++ }; } }));
  renderer.reconcile([f.fence]); assert.equal(f.original.hidden, false);
  await tick(); options.onReady(); assert.equal(f.original.hidden, true);
  f.code.textContent = 'changed'; f.fence.streaming = false; renderer.reconcile([f.fence]);
  assert.deepEqual(updates, [{ response: 'changed', streaming: false, theme: 'light' }]);
  renderer.reconcile([]); assert.equal(unmounted, 1); assert.equal(f.original.hidden, false); assert.equal(f.hosts[0].removed, true);
});
test('render error restores exact source; disposer unmounts', async () => {
  const f = fixture(); let options; let unmounted = 0;
  const renderer = createRenderer(async () => ({ mount(root, opts) { options = opts; return { update() {}, unmount() { unmounted++; } }; } }));
  renderer.reconcile([f.fence]); await tick(); options.onReady(); options.onError('expected failure');
  assert.equal(f.original.hidden, false); assert.equal(f.hosts[0].hidden, true); assert.equal(f.code.textContent, 'root = Text("Hello")');
  renderer.dispose(); assert.equal(unmounted, 1);
});
test('failed lazy import keeps original source visible', async () => {
  const f = fixture();
  const renderer = createRenderer(async () => { throw 'expected unavailable asset'; });
  renderer.reconcile([f.fence]); await tick();
  assert.equal(f.original.hidden, false); assert.equal(f.hosts[0].hidden, true);
  renderer.dispose(); assert.equal(f.hosts[0].removed, true);
});
test('theme update preserves stored state and remount restores it', async () => {
  const f = fixture(); const stored = new Map([['key', { $monthly: 0 }]]); const updates = []; let options; let theme = 'light';
  const renderer = createRenderer(async () => ({ mount(root, next) { options = next; return { update(value) { updates.push(value); }, unmount() {} }; } }), { theme: () => theme, loadState: key => stored.get(key), saveState: (key, value) => stored.set(key, value) });
  f.fence.stateKey = 'key'; renderer.reconcile([f.fence]); await tick();
  assert.deepEqual(options.initialState, { $monthly: 0 }); options.onStateChange({ $monthly: 1 });
  theme = 'dark'; renderer.reconcile([f.fence]); assert.equal(updates[0].theme, 'dark');
  renderer.reconcile([]); renderer.reconcile([f.fence]); await tick(); assert.deepEqual(options.initialState, { $monthly: 1 });
  renderer.dispose();
});
test('removed fence never mounts after lazy import resolves', async () => {
  const f = fixture(); let resolve; let mounts = 0;
  const renderer = createRenderer(() => new Promise(done => { resolve = done; }));
  renderer.reconcile([f.fence]); renderer.dispose();
  resolve({ mount() { mounts++; } }); await tick(); assert.equal(mounts, 0);
});
