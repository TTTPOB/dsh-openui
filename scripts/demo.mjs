/** Launch only an isolated localhost Host. Hold .locks/demo.lock around this script. */
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync, readFileSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { startDemoProcesses } from './demo-processes.mjs'
const root = fileURLToPath(new URL('../', import.meta.url))
const { values } = parseArgs({ options: {
  port: { type: 'string', default: '54180' },
  home: { type: 'string', default: '.demo-home' },
  plugin: { type: 'boolean', default: false },
  mobile: { type: 'boolean', default: false },
  tunnel: { type: 'boolean', default: false },
  frontend: { type: 'string' },
  'check-sources': { type: 'string' },
  'check-mode': { type: 'string', default: 'native' },
  'pace-ms': { type: 'string', default: '0' },
  refresh: { type: 'boolean', default: false },
  reply: { type: 'string', default: 'dev/fixture/reply.md' },
} })
if (values.port === '53083') throw new Error('Daily Host port is forbidden')
if (values.tunnel && values.port === '0') throw new Error('Tunnel requires a fixed isolated port')
const home = resolve(root, values.home)
if (!home.startsWith(root) || home === root) throw new Error('Demo home must be inside workspace')
const workspace = join(home, 'workspace')
mkdirSync(workspace, { recursive: true })
const env = { ...process.env, DSH_HOME: home }
function run(command, args, stdio = 'inherit', label = command) {
  const started = performance.now()
  const r = spawnSync(command, args, { cwd: root, env, stdio })
  console.log('[timing] ' + label + '=' + (performance.now() - started).toFixed(1) + 'ms')
  if (r.error) throw r.error
  if (r.status !== 0) throw new Error(command + ' exited ' + r.status)
}
const fixtureOutput = join(root, 'dev/fixture/dist/index.js')
const fixtureInputs = ['src/index.ts', 'build.mjs', 'runtime.mjs'].map(path => join(root, 'dev/fixture', path))
if (values.refresh || !existsSync(fixtureOutput) || fixtureInputs.some(path => statSync(path).mtimeMs > statSync(fixtureOutput).mtimeMs)) {
  run(process.execPath, ['dev/fixture/build.mjs'], 'inherit', 'fixture-build')
} else console.log('[timing] fixture-build=0ms (up to date)')
const profileManifest = join(home, 'profiles/web/package.json')
if (!existsSync(profileManifest)) run('dsh', ['--profile', 'web', '--dump-config'], 'ignore', 'profile-init')
else console.log('[timing] profile-init=0ms (existing isolated profile)')
function installed(name, spec) {
  const profile = JSON.parse(readFileSync(profileManifest, 'utf8'))
  return !values.refresh && profile.dependencies?.[name] === spec && profile.dsh?.profile?.bundles?.includes(name)
}
if (values.plugin) {
  if (!existsSync(join(root, 'packages/dsh-openui/dist/index.js'))) throw new Error('Build dsh-openui first')
  const spec = 'link:' + join(root, 'packages/dsh-openui')
  if (!installed('dsh-openui', spec)) run('dsh', ['plugin', '--profile', 'web', 'add', spec, '--config.auto-install-peers=false'], 'inherit', 'plugin-install')
  else console.log('[timing] plugin-install=0ms (already linked and active)')
}
if (values.mobile) {
  const spec = 'https://github.com/TTTPOB/dsh-mobile-workbench/releases/download/v3.3.0/dsh-web-mobile-3.3.0.tgz'
  if (!installed('dsh-web-mobile', spec)) run('dsh', ['plugin', '--profile', 'web', 'add', spec, '--config.auto-install-peers=false'], 'inherit', 'mobile-install')
  else console.log('[timing] mobile-install=0ms (already installed and active)')
}
const overlay = [
  ...(values['check-sources'] && values['check-mode'] === 'native' ? ['- id: tools', '  config:', '    mode: native'] : []),
  ...(values.frontend ? ['- id: frontend-static', '  config:', '    distIndex: ' + JSON.stringify(resolve(root, values.frontend))] : []),
  '- id: agent-default-model', '  config:', '    provider: openui-fixture', '    model: openui-fixture',
  '- id: session-title-llm', '  disabled: true',
  '- id: ui-settings-general', '  config:', '    welcomeNoticeVersion: "2026-09-28.1"',
  '- id: directory-picker', '  disabled: true',
  '- insert:',
  '    - id: directory-picker-browse', "      name: '@deepseek-ai/dsh-host-directory-picker-browse'",
  '    - id: ui-directory-picker-browse', "      name: '@deepseek-ai/dsh-client-ui-directory-picker-browse'",
  '    - id: openui-fixture', '      name: ' + JSON.stringify(join(root, 'dev/fixture/dist/index.js')),
  '      config:', '        replyFile: ' + JSON.stringify(resolve(root, values.reply)),
  '        callsFile: ' + JSON.stringify(join(home, 'calls.jsonl')), '        paceMs: ' + Number(values['pace-ms']),
  ...(values['check-sources'] ? ['        checkMode: ' + JSON.stringify(values['check-mode']), '        checkSources: ' + JSON.stringify(JSON.parse(readFileSync(resolve(root, values['check-sources']), 'utf8')))] : []), '',
].join('\n')
writeFileSync(join(home, 'fixture.patch.yml'), overlay)
writeFileSync(join(home, 'calls.jsonl'), '')
// Probe startup once, extract only the exact incompatible identities, then stop it.
const probe = await import('./compatibility.mjs')
const compatibilityStarted = performance.now()
await probe.grantDemoCompatibility({ root, home, workspace, env, run, refresh: values.refresh })
console.log('[timing] compatibility=' + (performance.now() - compatibilityStarted).toFixed(1) + 'ms')
const runtime = startDemoProcesses({ root, home, workspace, env, port: values.port, tunnel: values.tunnel })
const interrupt = () => runtime.stop(130, 'SIGINT')
const terminate = () => runtime.stop(143)
process.once('SIGINT', interrupt)
process.once('SIGTERM', terminate)
process.exitCode = await runtime.done
process.removeListener('SIGINT', interrupt)
process.removeListener('SIGTERM', terminate)
