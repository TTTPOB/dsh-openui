import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, type Page } from '@playwright/test'
export const demoHome = resolve(process.env.DSH_DEMO_HOME ?? '.demo-home')
export function demoUrl(): string {
  const url = new URL(process.env.DSH_BROWSER_URL ?? readFileSync(resolve(demoHome, 'url.txt'), 'utf8').trim())
  if (url.hostname !== '127.0.0.1' || url.port === '53083') throw new Error('Only isolated localhost Host is allowed')
  return url.href
}
export function readCalls(): unknown[] {
  return readFileSync(resolve(demoHome, 'calls.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
}
export async function openDemo(page: Page): Promise<void> {
  const started = performance.now()
  await page.goto(demoUrl())
  await page.locator('[data-composer-input]').waitFor({ state: 'attached' })
  const notice = page.getByRole('dialog', { name: 'Preview Notice', exact: true })
  // Isolated fixtures acknowledge onboarding in their overlay; no timeout-based negative wait.
  if (await notice.isVisible()) {
    await notice.getByRole('button', { name: 'Continue', exact: true }).click()
    await expect(notice).not.toBeVisible()
  }
  console.log('[timing] open-demo=' + (performance.now() - started).toFixed(1) + 'ms')
}
export async function fixtureSession(page: Page): Promise<void> {
  await openDemo(page)
  const mobileNavigation = page.locator('[data-workbench-destination="sessions"]')
  const mobile = await mobileNavigation.isVisible()
  if (mobile) await mobileNavigation.click()
  const selected = page.locator('[data-row-key^="session:"][aria-selected="true"]')
  const previousKey = await selected.count() ? await selected.first().getAttribute('data-row-key') : null
  await page.getByRole('button', { name: 'New session', exact: true }).first().click()
  if (previousKey) {
    await expect.poll(async () => await selected.count() ? selected.first().getAttribute('data-row-key') : null).not.toBe(previousKey)
  }
  if (mobile) await page.locator('[data-workbench-destination="session"]').click()
  // Wait for the async navigation before treating the old composer as the new session.
  await expect(page.locator('[data-chat-flow]')).toHaveCount(0)
  const editor = page.locator('[data-composer-input="true"]')
  if (await editor.getAttribute('contenteditable') !== 'true') {
    await page.getByRole('button', { name: 'Choose workspace', exact: true }).click()
    await expect(page.locator('[role="menu"], [role="dialog"]')).toBeVisible()
    const menu = page.getByRole('menu')
    if (await menu.isVisible()) {
      // Workspace titles are user-editable; add/adopt the exact path instead of guessing a title.
      await menu.getByRole('menuitem', { name: 'Add workspace…', exact: true }).click()
    }
    await page.getByRole('button', { name: 'Edit path', exact: true }).click()
    const path = page.getByRole('textbox', { name: 'Edit path', exact: true })
    await path.fill(resolve(demoHome, 'workspace'))
    await expect(path).toBeFocused()
    // Enter intentionally unmounts the path editor; do not re-resolve that locator afterward.
    await page.keyboard.press('Enter')
    await page.getByRole('button', { name: 'Open', exact: true }).click()
  }
  await expect(editor).toHaveAttribute('contenteditable', 'true')
}
export async function sendPrompt(page: Page, text = '显示本地贷款模拟器'): Promise<void> {
  await page.locator('[data-composer-input="true"]').fill(text)
  await page.getByRole('button', { name: 'Send message', exact: true }).click()
}
export async function waitForReply(page: Page): Promise<void> {
  await expect(page.getByText('OPENUI_FIXTURE_COMPLETE', { exact: true }).last()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Send message', exact: true })).toBeVisible()
}
