import { test, expect, chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { fixtureSession, sendPrompt, waitForReply, readCalls } from './helpers/demo';

for (const mode of ['desktop', 'touch-chromium'] as const) {
  test('OpenUI controls take focus from the composer: ' + mode, async ({}, testInfo) => {
    const touch = mode !== 'desktop';
    // Keep the loan fixture, adding one local button to verify React click handling too.
    expect(process.env.DSH_FIXTURE_REPLY).toBeTruthy();
    writeFileSync(process.env.DSH_FIXTURE_REPLY!, readFileSync('dev/fixture/loan-reply.md', 'utf8').replace('Stack([Text("DTI")', 'Button("重置月供", $monthly, 5), Stack([Text("DTI")'));
    const browser = await chromium.launch();
    const context = await browser.newContext({ viewport: touch ? { width: 390, height: 844 } : { width: 1280, height: 900 }, isMobile: touch, hasTouch: touch });
    const page = await context.newPage();
    try {
      await fixtureSession(page);
      const before = readCalls().length;
      await sendPrompt(page);
      await waitForReply(page);
      const host = page.locator('[data-dsh-openui-island]');
      const slider = host.getByRole('slider').first();
      const composer = page.locator('[data-composer-input="true"]');
      await expect(host.getByText('76.19%', { exact: true })).toBeVisible();
      if (touch) await composer.tap(); else await composer.click();
      await expect(composer).toBeFocused();
      await composer.evaluate(node => {
        (window as any).__composerFocusEvents = 0;
        const events: unknown[] = [];
        (window as any).__focusTrace = events;
        for (const type of ['focusin', 'focusout', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'click']) document.addEventListener(type, event => {
          const target = event.composedPath()[0] as HTMLElement;
          events.push({ type, target: target?.outerHTML?.slice(0, 130), time: performance.now() });
        }, true);
        node.addEventListener('focus', () => { (window as any).__composerFocusEvents++; });
      });
      // Count every focus, not only the final activeElement: a transient focus opens mobile keyboards.
      const noComposerFocus = async () => {
        // Include the client's 500 ms container scan, not only the synchronous event dispatch.
        await page.waitForTimeout(750);
        await expect(composer).not.toBeFocused();
        expect(await page.evaluate(() => (window as any).__composerFocusEvents)).toBe(0);
      };
      await test.step('drag directly from focused composer; retain local updates and keyboard control', async () => {
        await slider.scrollIntoViewIfNeeded();
        const box = (await slider.boundingBox())!;
        if (touch) {
          const cdp = await context.newCDPSession(page);
          const point = (x: number) => [{ x, y: box.y + box.height / 2, radiusX: 3, radiusY: 3, force: 1, id: 1 }];
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(box.x + box.width / 2) });
          for (let n = 1; n <= 6; n++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(box.x + box.width / 2 - n * (box.width / 2 - 8) / 6) });
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          await cdp.detach();
        } else {
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.down();
          await page.mouse.move(box.x + 8, box.y + box.height / 2, { steps: 6 });
          await page.mouse.up();
        }
        await expect(slider).toHaveValue('0');
        await expect(slider).toBeFocused();
        await expect(host.getByText('52.38%', { exact: true })).toBeVisible();
        await noComposerFocus();
        await slider.press('ArrowRight');
        await expect(slider).toHaveValue('1');
        await expect(host.getByText('57.14%', { exact: true })).toBeVisible();
        await expect(slider).toBeFocused();
        await noComposerFocus();
      });
      await test.step('slider and button activation preserve native and React handlers', async () => {
        if (touch) await slider.tap({ position: { x: 8, y: 20 } });
        else await slider.click({ position: { x: 8, y: 20 } });
        await expect(slider).toHaveValue('0');
        await noComposerFocus();
        const button = host.getByRole('button', { name: '重置月供', exact: true });
        if (touch) await button.tap(); else await button.click();
        await expect(button).toBeFocused();
        await expect(slider).toHaveValue('5');
        await expect(host.getByText('76.19%', { exact: true })).toBeVisible();
        await noComposerFocus();
      });
      expect(readCalls().length).toBe(before + 1);
      await test.step('normal composer focus and typing still work', async () => {
        if (touch) await composer.tap(); else await composer.click();
        await expect(composer).toBeFocused();
        await page.keyboard.type('Normal chat input');
        await expect(composer).toContainText('Normal chat input');
      });
    } finally {
      const tracePath = testInfo.outputPath('focus-sequence.json');
      writeFileSync(tracePath, JSON.stringify(await page.evaluate(() => (window as any).__focusTrace ?? []), null, 2));
      await testInfo.attach('focus-sequence', { path: tracePath, contentType: 'application/json' });
      await context.close(); await browser.close();
    }
  });
}
