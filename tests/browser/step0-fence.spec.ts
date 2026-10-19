import { test, expect } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fixtureSession, sendPrompt, waitForReply, readCalls } from './helpers/demo'
test('step0: capture native assistant fence DOM without OpenUI plugin', async ({ page }) => {
  await fixtureSession(page)
  const before = readCalls().length
  await sendPrompt(page)
  const streaming = await page.locator('[data-streaming]').first().waitFor({ state: 'attached', timeout: 3000 }).then(() => true, () => false)
  await waitForReply(page)
  expect(readCalls().length).toBe(before + 1)
  const code = page.locator('pre code').filter({ hasText: 'root = Card' }).last()
  await expect(code).toBeVisible()
  const evidence = await code.evaluate(node => {
    const ancestors = []
    for (let p: Element | null = node; p && ancestors.length < 16; p = p.parentElement) {
      ancestors.push({ tag: p.tagName, attrs: [...p.attributes].map(a => [a.name, a.value]) })
    }
    return { html: node.closest('.md-code-block')?.outerHTML, ancestors }
  })
  mkdirSync('docs/evidence', { recursive: true })
  await page.screenshot({ path: 'docs/evidence/step0-fence-dom.png', fullPage: true })
  writeFileSync('docs/evidence/step0-fence-dom.md', '# 第 0 步：真实 assistant 代码块 DOM\n\n隔离 DSH 0.2.1-rc.1、假 provider，无 OpenUI 插件。原生 UI 发起一次请求，callsFile +1。\n\n流式期间观察到 data-streaming：' + streaming + '。该 fixture 仅正文，无 reasoning；reasoning/空围栏未验证。\n\n## outerHTML\n\n```html\n'  + evidence.html + '\n```\n\n## 祖先属性\n\n```json\n' + JSON.stringify(evidence.ancestors, null, 2) + '\n```\n\n![原生围栏](step0-fence-dom.png)\n')
})
