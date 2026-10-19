#!/usr/bin/env node
/**
 * Real-model eval runner for one provider/model. Not part of CI.
 * Requires an isolated DSH_HOME prepared from provider/auth config only.
 */
import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import {
  appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { prepareHome, providerPatchPath, modelPatchPath } from './prepare.mjs'
import { grantCompatibility } from './compat.mjs'
import { startDemoProcesses } from '../demo-processes.mjs'

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const PROMPTS = JSON.parse(readFileSync(new URL('./prompts.json', import.meta.url), 'utf8'))
const SLEEP = ms => new Promise(resolve => setTimeout(resolve, ms))

function fail(message) {
  console.error('eval: ' + message)
  process.exit(1)
}

function safeName(value) {
  return String(value).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
}

function truncate(text, max) {
  return text.length <= max ? text : text.slice(0, max) + '\n…[truncated]'
}

function parseFences(markdown) {
  const result = []
  const re = /^```([^\r\n`]*)\r?\n([\s\S]*?)^```\s*$/gm
  for (const match of markdown.matchAll(re)) {
    result.push({ language: match[1].trim(), body: (match[2] ?? '').replace(/\r\n/g, '\n').replace(/\n$/, '') })
  }
  return result
}

function walkFiles(dir, output = []) {
  if (!existsSync(dir)) return output
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) walkFiles(path, output)
    else output.push(path)
  }
  return output
}

function sessionFile(home, sessionId) {
  const files = walkFiles(join(home, 'sessions'))
    .filter(path => path.includes('session-' + sessionId) && path.endsWith('.jsonl.zstd'))
  return files[0]
}

function readSession(home, sessionId) {
  const file = sessionId === undefined ? undefined : sessionFile(home, sessionId)
  if (file === undefined) return { file: null, events: [] }
  const text = execFileSync('zstd', ['-dc', file], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  const events = []
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue
    try { events.push(JSON.parse(line)) } catch { /* a torn final line is retried by the caller */ }
  }
  return { file, events }
}

function summarizeSession(session) {
  const events = session.events
  const assistant = events.filter(event => event.type === 'assistant/message')
  let lastText = ''
  for (const event of assistant) {
    const content = event?.data?.message?.content
    if (!Array.isArray(content)) continue
    const text = content.filter(block => block?.type === 'text').map(block => block.text).join('\n')
    if (text !== '') lastText = text
  }
  const skillCalls = events.filter(event => event.type === 'tool/call'
    && event?.data?.name === 'skill'
    && (() => {
      try { return JSON.parse(event.data.arguments).name === 'openui' } catch { return false }
    })()).length
  return {
    assistantMessages: assistant.length,
    turns: events.filter(event => event.type === 'turn/start').length,
    skillCalls,
    rawMarkdown: lastText,
  }
}

function waitForUrl(home, timeoutMs) {
  const path = join(home, 'url.txt')
  const started = Date.now()
  return new Promise((resolvePromise, reject) => {
    const tick = () => {
      if (existsSync(path)) {
        const value = readFileSync(path, 'utf8').trim()
        if (value !== '') return resolvePromise(value)
      }
      if (Date.now() - started > timeoutMs) return reject(new Error('timed out waiting for ' + path))
      setTimeout(tick, 150)
    }
    tick()
  })
}

async function dismissNotice(page) {
  const notice = page.getByRole('dialog', { name: 'Preview Notice', exact: true })
  try {
    await notice.waitFor({ state: 'visible', timeout: 3000 })
    await notice.getByRole('button', { name: 'Continue', exact: true }).click()
    await notice.waitFor({ state: 'detached', timeout: 5000 })
  } catch { /* no first-run notice */ }
}

async function chooseWorkspace(page, workspace) {
  const editor = page.locator('[data-composer-input="true"]')
  if (await editor.getAttribute('contenteditable') === 'true') return
  const chooser = page.getByRole('button', { name: 'Choose workspace', exact: true })
  if (await chooser.count() === 0) throw new Error('composer is not editable and has no workspace chooser')
  await chooser.click()
  const menu = page.getByRole('menu')
  if (await menu.isVisible()) {
    await menu.getByRole('menuitem', { name: 'workspace', exact: true }).click()
  } else {
    await page.getByRole('button', { name: 'Edit path', exact: true }).click()
    const input = page.getByRole('textbox', { name: 'Edit path', exact: true })
    await input.fill(workspace)
    await input.press('Enter')
    await page.getByRole('button', { name: 'Open', exact: true }).click()
  }
  await editor.waitFor({ state: 'attached' })
  await page.waitForFunction(() => document.querySelector('[data-composer-input="true"]')?.getAttribute('contenteditable') === 'true')
}

async function newSession(page, workspace) {
  await page.getByRole('button', { name: 'New session', exact: true }).first().click()
  await page.locator('[data-composer-input="true"]').waitFor({ state: 'attached' })
  await chooseWorkspace(page, workspace)
}

async function sendAndWait(page, prompt, timeoutMs) {
  const before = await page.locator('[data-chat-flow-kind="assistant-step"]').count()
  const editor = page.locator('[data-composer-input="true"]')
  await editor.fill(prompt)
  await page.getByRole('button', { name: 'Send message', exact: true }).click()
  await page.waitForFunction(
    value => document.querySelectorAll('[data-chat-flow-kind="assistant-step"]').length > value,
    before,
    { timeout: timeoutMs },
  )
  await page.waitForFunction(() => document.querySelector('[data-chat-running]') === null, null, { timeout: timeoutMs })
  await page.getByRole('button', { name: 'Send message', exact: true }).waitFor({ state: 'visible', timeout: timeoutMs })
  await page.waitForTimeout(500)
  const sessionId = await page.evaluate(() => {
    const raw = localStorage.getItem('dsh.sessions.current')
    if (raw === null) return undefined
    try { return JSON.parse(raw).sessionId } catch { return undefined }
  })
  return sessionId
}

async function readDom(page) {
  const row = page.locator('[data-chat-flow-kind="assistant-step"][data-chat-group-part="response"]').last()
  if (await row.count() === 0) return { row: false, codeBlocks: [], islands: [], streaming: false }
  return row.evaluate(element => {
    const codeBlocks = [...element.querySelectorAll('.md-code-block')].map(block => {
      const code = block.querySelector('[data-code-block-content] pre code')
      return {
        language: block.getAttribute('data-code-language'),
        body: code === null ? '' : (code.textContent ?? '').replace(/\r\n/g, '\n').replace(/\n$/, ''),
      }
    })
    const islands = [...element.querySelectorAll('[data-dsh-openui-island]')].map(host => {
      const root = host.shadowRoot
      const sliders = root === null ? 0 : root.querySelectorAll('input[type="range"]').length
      return { shadow: root !== null, textChars: root === null ? 0 : (root.textContent ?? '').length, sliders }
    })
    return { row: true, streaming: element.querySelector('[data-streaming]') !== null, codeBlocks, islands }
  }).then(value => ({ row: true, ...value }))
}

async function interact(page) {
  return page.evaluate(async () => {
    const hosts = [...document.querySelectorAll('[data-dsh-openui-island]')]
    if (hosts.length === 0) return { available: false, reason: 'no island host' }
    const host = hosts[hosts.length - 1]
    const root = host.shadowRoot
    if (root === null) return { available: false, reason: 'closed shadow root' }
    const sliders = [...root.querySelectorAll('input[type="range"]')]
    if (sliders.length === 0) return { available: false, reason: 'no range input', sliders: 0 }
    const before = root.textContent ?? ''
    const slider = sliders[0]
    const min = Number(slider.min || 0)
    const max = Number(slider.max || 100)
    const next = Number(slider.value) >= max ? min : max
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(slider, String(next))
    slider.dispatchEvent(new Event('input', { bubbles: true }))
    slider.dispatchEvent(new Event('change', { bubbles: true }))
    await new Promise(resolve => setTimeout(resolve, 400))
    const after = root.textContent ?? ''
    return { available: true, sliders: sliders.length, before, after, changed: before !== after }
  })
}

async function main() {
  const { values } = parseArgs({ options: {
    provider: { type: 'string' },
    model: { type: 'string' },
    home: { type: 'string' },
    out: { type: 'string' },
    case: { type: 'string', multiple: true, default: [] },
    limit: { type: 'string' },
    list: { type: 'boolean', default: false },
    fresh: { type: 'boolean', default: false },
    headed: { type: 'boolean', default: false },
    timeout: { type: 'string', default: '180000' },
    sourceHome: { type: 'string' },
  } })
  const allCases = Object.entries(PROMPTS.groups).flatMap(([group, cases]) => cases.map(item => ({ ...item, group })))
  const selected = allCases.filter(item => values.case.length === 0 || values.case.includes(item.id))
  const limited = values.limit === undefined ? selected : selected.slice(0, Number(values.limit))
  if (values.list) {
    console.log(JSON.stringify(limited, null, 2))
    return
  }
  if (values.provider === undefined || values.model === undefined) fail('--provider and --model are required')
  if (limited.length === 0) fail('no matching cases')
  const home = resolve(ROOT, values.home ?? join('.demo-home/eval', safeName(values.provider + '-' + values.model)))
  if (values.fresh) {
    if (!home.startsWith(join(ROOT, '.demo-home', 'eval') + '/')) fail('refusing --fresh outside .demo-home/eval: ' + home)
    rmSync(home, { recursive: true, force: true })
  }
  const sourceHome = values.sourceHome ?? process.env.DSH_EVAL_SOURCE_HOME
  const prepared = prepareHome({ home, sourceHome, provider: values.provider, model: values.model })
  console.error('eval: isolated home ' + prepared.destHome + '; provider rows ' + prepared.providerRows.join(','))
  const env = { ...process.env, DSH_HOME: home }
  const workspace = join(home, 'workspace')
  mkdirSync(workspace, { recursive: true })
  const patchFiles = [providerPatchPath(home), modelPatchPath(home)]
  await grantCompatibility({ home, workspace, env, patchFiles })
  const runtime = startDemoProcesses({ home, workspace, env, port: '0', patchFiles })
  let hostExitCode = null
  void runtime.done.then(code => { hostExitCode = code })
  let browser
  const out = resolve(ROOT, values.out ?? join('docs/evidence', 'eval-' + new Date().toISOString().slice(0, 10) + '.jsonl'))
  mkdirSync(dirname(out), { recursive: true })
  try {
    const url = await waitForUrl(home, 60000)
    if (hostExitCode !== null) throw new Error('Host exited before URL: ' + hostExitCode)
    browser = await chromium.launch({ headless: !values.headed, args: ['--no-sandbox'] })
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-US' })
    const page = await context.newPage()
    const consoleErrors = []
    const pageErrors = []
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })
    page.on('pageerror', error => pageErrors.push(String(error)))
    await page.goto(url)
    await page.locator('[data-composer-input]').waitFor({ state: 'attached', timeout: 30000 })
    await dismissNotice(page)
    for (const item of limited) {
      consoleErrors.length = 0
      pageErrors.length = 0
      const startedAt = new Date()
      const start = Date.now()
      let record
      try {
        await newSession(page, workspace)
        const sessionId = await sendAndWait(page, item.prompt, Number(values.timeout))
        const beforeSession = readSession(home, sessionId)
        const before = summarizeSession(beforeSession)
        const dom = await readDom(page)
        const reactVersion = await page.evaluate(() => globalThis.__DSH_OPENUI_ISLAND__?.reactVersion ?? null)
        const interaction = await interact(page)
        const afterSession = readSession(home, sessionId)
        const after = summarizeSession(afterSession)
        const rawFences = parseFences(after.rawMarkdown)
        const openuiFences = rawFences.filter(fence => fence.language.trim() === 'openui-lang')
        const islandOk = dom.islands.length > 0
          && dom.islands.every(island => island.shadow && island.textChars > 0)
          && typeof reactVersion === 'string' && reactVersion.startsWith('19.')
          && !consoleErrors.some(message => message.includes('[dsh-openui]'))
          && pageErrors.length === 0
        const triggered = openuiFences.length > 0
        const rendered = triggered && islandOk
        const localRecompute = interaction.available === true
          && interaction.changed === true
          && before.turns === after.turns
        const verdict = item.group === 'should-ui'
          ? (rendered ? 'pass' : triggered ? 'partial' : 'fail')
          : (!triggered && !islandOk ? 'pass' : 'fail')
        record = {
          run: { provider: values.provider, model: values.model, startedAt: startedAt.toISOString(), home },
          case: { id: item.id, group: item.group, domain: item.domain, prompt: item.prompt },
          session: { id: sessionId, file: afterSession.file },
          elapsedMs: Date.now() - start,
          response: {
            assistantMessages: after.assistantMessages,
            turns: after.turns,
            skillCalls: after.skillCalls,
            skillLoaded: after.skillCalls > 0,
            rawMarkdown: truncate(after.rawMarkdown, 8000),
            fences: rawFences,
          },
          dom: {
            row: dom.row,
            streamingObserved: dom.streaming === true,
            codeBlocks: dom.codeBlocks,
            islands: dom.islands,
            islandReactVersion: reactVersion,
          },
          interaction: {
            available: interaction.available === true,
            sliders: interaction.sliders ?? 0,
            changed: interaction.changed === true,
            reason: interaction.reason,
            localRecompute,
          },
          errors: { console: consoleErrors.slice(0, 50), page: pageErrors.slice(0, 50) },
          scoring: { triggered, rendered, localRecompute, verdict },
        }
      } catch (error) {
        record = {
          run: { provider: values.provider, model: values.model, startedAt: startedAt.toISOString(), home },
          case: { id: item.id, group: item.group, domain: item.domain, prompt: item.prompt },
          elapsedMs: Date.now() - start,
          error: error instanceof Error ? error.message : String(error),
          errors: { console: consoleErrors.slice(0, 50), page: pageErrors.slice(0, 50) },
          scoring: { triggered: false, rendered: false, localRecompute: false, verdict: 'error' },
        }
      }
      appendFileSync(out, JSON.stringify(record) + '\n', { mode: 0o644 })
      console.error('eval: ' + item.id + ' -> ' + record.scoring.verdict)
    }
    await context.close()
  } finally {
    if (browser !== undefined) await browser.close().catch(() => {})
    runtime.stop(0)
    await runtime.done.catch(() => {})
  }
  console.error('eval: wrote ' + out)
}

main().catch(error => { console.error(error); process.exit(1) })
