import { test, expect, chromium, webkit } from '@playwright/test'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fixtureSession, sendPrompt, waitForReply, readCalls } from './helpers/demo'

for (const engine of ['chromium', 'webkit'] as const) {
  test('mobile coexistence: ' + engine, async () => {
    const localLibraries = process.platform === 'linux' && existsSync('.tools/webkit-deps/usr/lib/x86_64-linux-gnu/libgstcodecparsers-1.0.so.0')
    const browser = await (engine === 'chromium' ? chromium : webkit).launch(engine === 'webkit' && localLibraries ? {
      executablePath: resolve('scripts/webkit-launch.mjs'),
      env: { ...process.env, LD_LIBRARY_PATH: resolve('.tools/webkit-deps/usr/lib/x86_64-linux-gnu') },
    } : {})
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true })
    try {
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await fixtureSession(page)
      await expect(page.locator('[data-workbench-destination="session"]')).toBeVisible()
      const before = readCalls().length
      await sendPrompt(page)
      await waitForReply(page)
      const host = page.locator('[data-dsh-openui-island]')
      const slider = host.getByRole('slider').first()
      await expect(host.getByRole('slider')).toHaveCount(3)
      await expect(host.getByText('76.19%', { exact: true })).toBeVisible()
      await slider.scrollIntoViewIfNeeded()
      await expect(slider).toBeEnabled()
      expect(readCalls().length).toBe(before + 1)
      const sizes = await host.getByRole('slider').evaluateAll(nodes => nodes.map(node => ({ width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height, touchAction: getComputedStyle(node).touchAction })))
      for (const size of sizes) { expect(size.height).toBeGreaterThanOrEqual(40); expect(size.width).toBeGreaterThanOrEqual(40); expect(size.touchAction).toBe('pan-y') }
      const box = (await slider.boundingBox())!
      if (engine === 'chromium') {
        const cdp = await context.newCDPSession(page)
        const point = (x: number) => [{ x, y: box.y + box.height / 2, radiusX: 3, radiusY: 3, force: 1, id: 1 }]
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(box.x + box.width / 2) })
        for (let n = 1; n <= 6; n++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(box.x + box.width / 2 - n * (box.width / 2 - 8) / 6) })
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
        await cdp.detach()
      } else {
        // Playwright WebKit exposes touch taps, but no trusted touch-drag API.
        await page.touchscreen.tap(box.x + 8, box.y + box.height / 2)
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
        await page.mouse.down()
        await page.mouse.move(box.x + 8, box.y + box.height / 2, { steps: 6 })
        await page.mouse.up()
      }
      await expect(slider).toHaveValue('0')
      await expect(host.getByText('52.38%', { exact: true })).toBeVisible()
      await expect(host.getByText('REVIEW', { exact: true })).toBeVisible()
      expect(readCalls().length).toBe(before + 1)
      const tooltip = await host.evaluate(node => {
        const tip = node.ownerDocument.createElement('div')
        tip.setAttribute('role', 'tooltip')
        tip.textContent = 'Shadow tooltip probe'
        node.shadowRoot!.append(tip)
        return { display: getComputedStyle(tip).display, visibility: getComputedStyle(tip).visibility, height: tip.getBoundingClientRect().height, inPhase: Boolean(node.closest('[data-phase]')) }
      })
      expect(tooltip.display).not.toBe('none')
      expect(tooltip.visibility).toBe('visible')
      expect(tooltip.height).toBeGreaterThan(0)
      const overflow = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }))
      expect(overflow.document).toBeLessThanOrEqual(overflow.viewport + 1)
      expect(errors.filter(error => /Invalid hook call|React|openui/i.test(error))).toEqual([])
      mkdirSync('docs/evidence', { recursive: true })
      await page.screenshot({ path: 'docs/evidence/mobile-' + engine + '.png', fullPage: true })
      writeFileSync('docs/evidence/mobile-' + engine + '.json', JSON.stringify({ engine, viewport: { width: 390, height: 844 }, sizes, tooltip, overflow, callsAdded: readCalls().length - before, touchDrag: engine === 'chromium' ? 'trusted CDP touch drag' : 'touch tap + trusted mouse drag; physical touch drag pending' }, null, 2) + '\n')
    } finally { await context.close(); await browser.close() }
  })
}
