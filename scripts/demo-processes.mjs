/** Own the isolated Host and optional quick tunnel as one process lifetime. */
import { spawn } from 'node:child_process'
import { chmodSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export function startDemoProcesses(options, spawnProcess = spawn) {
  const { home, workspace, env, port, trustedHosts = [], tunnel = false, patchFiles = [join(home, "fixture.patch.yml")] } = options
  const children = new Set()
  let stopping = false
  let exitCode = 0
  let killTimer
  let tunnelTimer
  let finish
  const done = new Promise(resolve => { finish = resolve })
  const save = (name, value) => {
    const path = join(home, name)
    writeFileSync(path, value, { mode: 0o600 })
    chmodSync(path, 0o600)
  }
  save('url.txt', '')
  save('public-url.txt', '')
  save('demo.pid', String(process.pid) + '\n')

  function stop(code = 0, signal = 'SIGTERM') {
    if (stopping) return
    stopping = true
    exitCode = code
    clearTimeout(tunnelTimer)
    for (const child of children) child.kill(signal)
    if (children.size === 0) finish(exitCode)
    else killTimer = setTimeout(() => {
      for (const child of children) child.kill('SIGKILL')
    }, 5000).unref()
  }

  function launch(command, args, stdio) {
    const child = spawnProcess(command, args, { cwd: workspace, env, stdio })
    children.add(child)
    child.on('error', error => { console.error(error); stop(1) })
    child.on('close', (code, signal) => {
      children.delete(child)
      if (!stopping) {
        console.error(`${command} exited (${signal ?? code}); stopping demo processes`)
        stop(code ?? 1)
      }
      if (children.size === 0 && stopping) { clearTimeout(killTimer); finish(exitCode) }
    })
    return child
  }

  function startHost(publicOrigin) {
    if (stopping) return
    const hosts = publicOrigin ? [...trustedHosts, new URL(publicOrigin).hostname] : trustedHosts
    const child = launch('dsh', ['--profile', 'web', ...patchFiles.flatMap(path => ['--patch', path]), '--host', '127.0.0.1', '--port', port, '--no-open',
      ...hosts.flatMap(host => ['--trusted-host', host])], ['inherit', 'pipe', 'inherit'])
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
        save('url.txt', url.href + '\n')
        console.log(`Authenticated demo URL: ${url.href}\nURL file: ${join(home, 'url.txt')}\nStop demo: kill -TERM ${process.pid}`)
        if (publicOrigin) {
          const publicUrl = new URL(url.pathname + url.search, publicOrigin).href
          save('public-url.txt', publicUrl + '\n')
          console.log(`Public demo URL: ${publicUrl}\nPublic URL file: ${join(home, 'public-url.txt')}\nToken-bearing URL: do not share outside the intended phone reviewer.`)
        }
      }
    })
  }

  try {
    if (!tunnel) startHost()
    else {
      console.log('Starting cloudflared quick tunnel with HTTP/2; inheriting HTTP(S)_PROXY.')
      const child = launch('/usr/local/bin/cloudflared', ['tunnel', '--no-autoupdate', '--protocol', 'http2',
        '--url', `http://127.0.0.1:${port}`], ['ignore', 'pipe', 'pipe'])
      let pending = ''
      let origin
      tunnelTimer = setTimeout(() => {
        console.error('cloudflared did not publish a quick tunnel URL within 60s; inspect its errors and the existing proxy.')
        stop(1)
      }, 60000)
      for (const stream of [child.stdout, child.stderr]) {
        stream.setEncoding('utf8')
        stream.on('data', chunk => {
          process.stderr.write(chunk)
          if (origin || stopping) return
          pending = (pending + chunk).slice(-8192)
          const match = pending.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com(?=[\s/]|$)/)
          if (!match) return
          origin = new URL(match[0]).origin
          clearTimeout(tunnelTimer)
          startHost(origin)
        })
      }
    }
  } catch (error) { console.error(error); stop(1) }
  return { stop, done }
}
