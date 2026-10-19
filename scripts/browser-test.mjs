/** Hold the caller's demo lock across Host startup, browser tests and cleanup. */
import { spawn } from 'node:child_process'
import { copyFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
const args = process.argv.slice(2)
const mobile = args.some(arg => /mobile-/.test(arg))
const plugin = mobile || args.some(arg => /openui-/.test(arg))
const home = mobile ? '.demo-home/mobile' : plugin ? '.demo-home' : '.demo-home/step0'
const reply = resolve(home, 'reply.md')
if (plugin) { mkdirSync(home, { recursive: true }); copyFileSync('dev/fixture/loan-reply.md', reply) }
const host = spawn(process.execPath, ['scripts/demo.mjs', '--port', '0', '--home', home, ...(plugin ? ['--plugin', '--reply', reply] : []), ...(mobile ? ['--mobile'] : []), ...(process.env.DSH_FIXTURE_CHECK_SOURCES ? ['--check-sources', process.env.DSH_FIXTURE_CHECK_SOURCES, '--check-mode', process.env.DSH_FIXTURE_CHECK_MODE ?? 'native'] : [])], { stdio: ['ignore', 'pipe', 'inherit'] })
let timer, testProcess, stopping = false
const closed = new Promise(resolve => host.once('close', resolve))
function stop() {
  if (stopping) return
  stopping = true
  testProcess?.kill('SIGTERM')
  host.kill('SIGTERM')
}
process.once('SIGINT', stop)
process.once('SIGTERM', stop)
try {
  await new Promise((resolveReady, reject) => {
    let text = ''
    timer = setTimeout(() => reject(new Error('Demo startup timed out')), 60000)
    host.once('close', code => reject(new Error('Demo exited before ready: ' + code)))
    host.stdout.on('data', chunk => {
      process.stdout.write(chunk)
      text += chunk
      if (text.includes('Authenticated demo URL:')) { clearTimeout(timer); resolveReady() }
    })
  })
  testProcess = spawn(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', ...(args.length ? args : ['tests/browser/step0-fence.spec.ts'])], { stdio: 'inherit', env: { ...process.env, DSH_DEMO_HOME: home, ...(plugin ? { DSH_FIXTURE_REPLY: reply } : {}) } })
  process.exitCode = await new Promise(resolveCode => testProcess.once('close', code => resolveCode(code ?? 1)))
} catch (error) { console.error(error); process.exitCode = 1 }
finally {
  clearTimeout(timer)
  stop()
  await closed
  process.removeListener('SIGINT', stop)
  process.removeListener('SIGTERM', stop)
}
