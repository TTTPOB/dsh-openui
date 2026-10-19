/** Launch only an isolated localhost Host. Hold .locks/demo.lock around this script. */
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
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
  reply: { type: 'string', default: 'dev/fixture/reply.md' },
} })
if (values.port === '53083') throw new Error('Daily Host port is forbidden')
if (values.tunnel && values.port === '0') throw new Error('Tunnel requires a fixed isolated port')
const home = resolve(root, values.home)
if (!home.startsWith(root) || home === root) throw new Error('Demo home must be inside workspace')
const workspace = join(home, 'workspace')
mkdirSync(workspace, { recursive: true })
const env = { ...process.env, DSH_HOME: home }
function run(command, args, stdio = 'inherit') {
  const r = spawnSync(command, args, { cwd: root, env, stdio })
  if (r.error) throw r.error
  if (r.status !== 0) throw new Error(command + ' exited ' + r.status)
}
run(process.execPath, ['dev/fixture/build.mjs'])
run('dsh', ['--profile', 'web', '--dump-config'], 'ignore')
if (values.plugin) {
  if (!existsSync(join(root, 'packages/dsh-openui/dist/index.js'))) throw new Error('Build dsh-openui first')
  run('dsh', ['plugin', '--profile', 'web', 'add', 'link:' + join(root, 'packages/dsh-openui'), '--config.auto-install-peers=false'])
}
if (values.mobile) {
  run('dsh', ['plugin', '--profile', 'web', 'add', 'https://github.com/TTTPOB/dsh-mobile-workbench/releases/download/v3.3.0/dsh-web-mobile-3.3.0.tgz', '--config.auto-install-peers=false'])
}
const overlay = [
  ...(values.frontend ? ['- id: frontend-static', '  config:', '    distIndex: ' + JSON.stringify(resolve(root, values.frontend))] : []),
  '- id: agent-default-model', '  config:', '    provider: openui-fixture', '    model: openui-fixture',
  '- id: session-title-llm', '  disabled: true',
  '- id: directory-picker', '  disabled: true',
  '- insert:',
  '    - id: directory-picker-browse', "      name: '@deepseek-ai/dsh-host-directory-picker-browse'",
  '    - id: ui-directory-picker-browse', "      name: '@deepseek-ai/dsh-client-ui-directory-picker-browse'",
  '    - id: openui-fixture', '      name: ' + JSON.stringify(join(root, 'dev/fixture/dist/index.js')),
  '      config:', '        replyFile: ' + JSON.stringify(resolve(root, values.reply)),
  '        callsFile: ' + JSON.stringify(join(home, 'calls.jsonl')), '        paceMs: 20', '',
].join('\n')
writeFileSync(join(home, 'fixture.patch.yml'), overlay)
writeFileSync(join(home, 'calls.jsonl'), '')
// Probe startup once, extract only the exact incompatible identities, then stop it.
const probe = await import('./compatibility.mjs')
await probe.grantDemoCompatibility({ root, home, workspace, env, run })
const runtime = startDemoProcesses({ root, home, workspace, env, port: values.port, tunnel: values.tunnel })
const interrupt = () => runtime.stop(130, 'SIGINT')
const terminate = () => runtime.stop(143)
process.once('SIGINT', interrupt)
process.once('SIGTERM', terminate)
process.exitCode = await runtime.done
process.removeListener('SIGINT', interrupt)
process.removeListener('SIGTERM', terminate)
