import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
const base = resolve(fileURLToPath(new URL('..', import.meta.url)));
const server = createServer(async (req, res) => {
  const file = resolve(base, '.' + new URL(req.url, 'http://localhost').pathname);
  if (!file.startsWith(base + '/')) { res.writeHead(403).end(); return; }
  try { res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript' })[extname(file)] ?? 'text/plain'); res.end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:' + server.address().port + '/test/index.html');
  await page.getByText('76.19%', { exact: true }).waitFor();
  assert.equal(await page.getByRole('slider').count(), 3);
  assert.equal(await page.getByText('1.80', { exact: true }).count(), 1);
  const slider = page.getByRole('slider', { name: '月供', exact: true });
  await slider.focus(); await page.keyboard.press('Home');
  await page.getByText('52.38%', { exact: true }).waitFor();
  await page.getByText('REVIEW', { exact: true }).waitFor();
  await page.getByRole('slider', { name: '抵押估值', exact: true }).focus(); await page.keyboard.press('Home');
  await page.getByText('0.60', { exact: true }).waitFor();
  await page.getByText('DECLINE', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.actions.length), 0);
  assert.equal(await page.locator('head style').count(), 0);
  assert.equal(await page.locator('#error').textContent(), '');
  await page.evaluate(() => window.islandHandle.update({ theme: 'dark' }));
  assert.equal(await page.locator('#island').evaluate(host => getComputedStyle(host.shadowRoot.querySelector('.card')).backgroundColor), 'rgb(23, 32, 51)');
  await page.evaluate(() => window.islandHandle.update({ theme: 'light' }));
  assert.equal(await page.locator('#island').evaluate(host => getComputedStyle(host.shadowRoot.querySelector('.card')).backgroundColor), 'rgb(255, 255, 255)');
  await page.getByText('52.38%', { exact: true }).waitFor();
  assert.match(await page.evaluate(() => window.__DSH_OPENUI_ISLAND__.reactVersion), /^19\./);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: resolve(base, 'test/loan.png') });
  await page.evaluate(() => window.islandHandle.unmount());
  assert.equal(await page.evaluate(() => document.getElementById('island').shadowRoot.childNodes.length), 0);
  console.log('PASS: 3 sliders, DTI 76.19% -> 52.38%, coverage 1.80 -> 0.60, REVIEW -> DECLINE, actions=0, head styles=0, React19, unmount=0');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
