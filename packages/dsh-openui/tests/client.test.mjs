import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const built = await build({ entryPoints: [new URL('../src/client.ts', import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'browser' });
const { apply } = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));

test('snapshot event connects the container next frame without waiting for polling', () => {
  let root = null; let targetUpdate; let dispose; const observed = []; const frames = new Map(); let id = 0;
  const previous = new Map(['document', 'sessionStorage', 'window', 'requestAnimationFrame', 'cancelAnimationFrame', 'MutationObserver'].map(key => [key, globalThis[key]]));
  Object.assign(globalThis, {
    document: { querySelector: () => root }, sessionStorage: {},
    window: { setInterval: () => 1, clearInterval() {} },
    requestAnimationFrame: callback => { frames.set(++id, callback); return id; }, cancelAnimationFrame: key => frames.delete(key),
    MutationObserver: class { observe(node) { observed.push(node); } disconnect() {} },
  });
  const flush = () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback()); };
  try {
    apply({
      effect(install) { dispose = install(); }, on: () => () => {}, theme: { getTheme: () => ({ active: { colorScheme: 'light' } }) },
      sessions: { binding: () => ({}) }, uiSession: { adapter: { current: { getSnapshot: () => ({ key: 's' }), subscribe: () => () => {} } } },
      uiConversation: { binding: () => ({ target: () => ({ getSnapshot: () => ({ nodes: { values: () => [] } }), subscribe(callback) { targetUpdate = callback; return () => {}; } }) }) },
    });
    flush(); assert.equal(observed.length, 0);
    root = { isConnected: true, querySelectorAll: () => [] };
    targetUpdate(); flush(); assert.deepEqual(observed, [root]);
    dispose(); assert.equal(frames.size, 0);
  } finally { for (const [key, value] of previous) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } }
});
