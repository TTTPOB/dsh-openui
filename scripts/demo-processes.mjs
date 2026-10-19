/** Own the isolated Host until shutdown, including escalation for stuck children. */
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
export function startDemoProcesses({ home, workspace, env, port, patchFiles = [join(home, 'fixture.patch.yml')] }) {
  let finish, stopping = false, exitCode = 0, timer
  const done = new Promise(resolve => { finish = resolve })
  writeFileSync(join(home, 'url.txt'), '', { mode: 0o600 })
  writeFileSync(join(home, 'demo.pid'), String(process.pid) + '\n')
  const child = spawn('dsh', ['--profile', 'web', ...patchFiles.flatMap(path => ['--patch', path]),
    '--host', '127.0.0.1', '--port', port, '--no-open'], { cwd: workspace, env, stdio: ['ignore', 'pipe', 'inherit'] })
  const stop = (code = 0, signal = 'SIGTERM') => {
    if (stopping) return
    stopping = true
    exitCode = code
    child.kill(signal)
    timer = setTimeout(() => child.kill('SIGKILL'), 5000).unref()
  }
  child.on('error', error => { console.error(error); finish(1) })
  child.on('close', code => { clearTimeout(timer); finish(stopping ? exitCode : code ?? 1) })
  let pending = ''
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', chunk => {
    process.stdout.write(chunk)
    pending += chunk
    const lines = pending.split('\n')
    pending = lines.pop()
    for (const line of lines) {
      if (!line.startsWith('dsh web: http')) continue
      const url = new URL(line.slice('dsh web: '.length).trim())
      if (url.hostname !== '127.0.0.1' || url.port === '53083') { stop(1); return }
      writeFileSync(join(home, 'url.txt'), url.href + '\n', { mode: 0o600 })
      console.log('Authenticated demo URL: ' + url.href)
    }
  })
  return { done, stop }
}
