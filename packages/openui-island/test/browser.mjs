import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
const base = resolve(fileURLToPath(new URL('..', import.meta.url)));
const out = process.env.OPENUI_OUT_DIR ?? 'dist';
const evidence = resolve(base, '../../docs/evidence');
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = pathname === '/dist/island.js' ? resolve(base, out, 'island.js') : resolve(base, '.' + pathname);
  if (!file.startsWith(base + '/')) { res.writeHead(403).end(); return; }
  try { res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[extname(file)] ?? 'text/plain'); res.end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true });
try {
  await mkdir(evidence, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1100, height: 1100 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:' + server.address().port + '/test/index.html');
  await page.getByText('76.19%', { exact: true }).waitFor();
  assert.equal(await page.getByRole('slider').count(), 3);
  assert.equal(await page.getByText('1.80', { exact: true }).count(), 1);
  assert.equal(await page.getByRole('table').count(), 1);
  assert.equal(await page.getByRole('img', { name: '月供敏感性 · DTI (%)' }).count(), 1);
  const card = page.locator('#island').locator('.card');
  assert.equal(await card.evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(255, 255, 255)');
  assert.equal(await card.evaluate(node => getComputedStyle(node).borderRadius), '16px');
  assert.equal(await card.evaluate(node => getComputedStyle(node).fontFamily), await page.locator('#island').evaluate(node => getComputedStyle(node).fontFamily));
  await page.screenshot({ path: resolve(evidence, 'island-visual-light.png'), fullPage: true });
  await page.evaluate(() => window.setTheme('dark'));
  assert.equal(await card.evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(44, 44, 46)');
  const slider = page.getByRole('slider', { name: '月供', exact: true });
  await slider.focus();
  assert.equal(await slider.evaluate(node => getComputedStyle(node).outlineStyle), 'none');
  await page.screenshot({ path: resolve(evidence, 'island-visual-dark.png'), fullPage: true });
  await page.keyboard.press('Home');
  await page.getByText('52.38%', { exact: true }).waitFor();
  await page.getByText('REVIEW', { exact: true }).waitFor();
  assert.equal(await page.locator('#island').locator('[data-tone="warning"]').count(), 1);
  await page.getByRole('slider', { name: '抵押估值', exact: true }).focus(); await page.keyboard.press('Home');
  await page.getByText('0.60', { exact: true }).waitFor();
  await page.getByText('DECLINE', { exact: true }).waitFor();
  await page.evaluate(() => window.setTheme('light'));
  await page.getByText('52.38%', { exact: true }).waitFor();
  // Host custom theme tokens must override island fallback colors without remounting.
  await page.evaluate(() => document.body.style.setProperty('--dsw-alias-bg-layer-2', 'rgb(238, 240, 242)'));
  assert.equal(await card.evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(238, 240, 242)');
  await page.evaluate(() => document.body.style.removeProperty('--dsw-alias-bg-layer-2'));
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.ok((await slider.boundingBox()).height >= 40);
  assert.equal(await slider.evaluate(node => getComputedStyle(node).touchAction), 'pan-y');
  await page.screenshot({ path: resolve(evidence, 'island-visual-mobile.png'), fullPage: true });
  assert.equal(await page.evaluate(() => window.actions.length), 0);
  assert.equal(await page.locator('head style').count(), 0);
  assert.equal(await page.locator('#error').textContent(), '');
  assert.match(await page.evaluate(() => window.__DSH_OPENUI_ISLAND__.reactVersion), /^19\./);
  assert.deepEqual(errors, []);
  await page.evaluate(() => window.islandHandle.unmount());
  assert.equal(await page.evaluate(() => document.getElementById('island').shadowRoot.childNodes.length), 0);
  console.log('PASS: 3 sliders; Metric/Grid/Table/Chart; DTI 76.19 -> 52.38; coverage 1.80 -> 0.60; host tokens/font/radius; theme state retained; thumb-only focus; 390px no overflow; actions=0; head styles=0; unmount=0');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
