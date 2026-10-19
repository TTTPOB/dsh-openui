/** Start one isolated eval Host without printing its token-bearing URL. */
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

export function startEvalHost({ home, workspace, env, port, patchFiles }) {
  let finish
  let resolveUrl
  let rejectUrl
  let urlSettled = false
  let stopping = false
  let exitCode = 0
  let timer
  const done = new Promise(resolve => { finish = resolve })
  const url = new Promise((resolve, reject) => { resolveUrl = resolve; rejectUrl = reject })
  writeFileSync(join(home, 'url.txt'), '', { mode: 0o600 })
  writeFileSync(join(home, 'demo.pid'), String(process.pid) + '\n')
  const child = spawn('dsh', ['--profile', 'web', ...patchFiles.flatMap(path => ['--patch', path]),
    '--host', '127.0.0.1', '--port', port, '--no-open'], {
    cwd: workspace, env, stdio: ['ignore', 'pipe', 'inherit'],
  })
  const stop = (code = 0, signal = 'SIGTERM') => {
    if (stopping) return
    stopping = true
    exitCode = code
    child.kill(signal)
    timer = setTimeout(() => child.kill('SIGKILL'), 5000).unref()
  }
  child.on('error', error => {
    if (!urlSettled) { urlSettled = true; rejectUrl(error) }
    finish(1)
  })
  child.on('close', code => {
    clearTimeout(timer)
    if (!urlSettled) { urlSettled = true; rejectUrl(new Error('Host exited before publishing a URL')) }
    finish(stopping ? exitCode : code ?? 1)
  })
  let pending = ''
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', chunk => {
    pending += chunk
    const lines = pending.split('\n')
    pending = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('dsh web: http')) continue
      let parsed
      try { parsed = new URL(line.slice('dsh web: '.length).trim()) } catch { continue }
      if (parsed.hostname !== '127.0.0.1' || parsed.port === '53083') { stop(1); return }
      writeFileSync(join(home, 'url.txt'), parsed.href + '\n', { mode: 0o600 })
      if (!urlSettled) { urlSettled = true; resolveUrl(parsed.href) }
    }
  })
  return { done, stop, url }
}
