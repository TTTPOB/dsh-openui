import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { startDemoProcesses } from '../demo-processes.mjs'

function fakeSpawner() {
  const calls = []
  function spawn(command, args, options) {
    const child = new EventEmitter()
    child.stdout = new PassThrough()
    child.stderr = new PassThrough()
    child.kill = signal => { child.signal = signal; queueMicrotask(() => child.emit('close', null, signal)); return true }
    calls.push({ command, args, options, child })
    return child
  }
  return { calls, spawn }
}
test('native Host uses caller patches and cleans up on stop', async () => {
  const home = resolve('test-results/process-native')
  mkdirSync(home, { recursive: true })
  const mock = fakeSpawner()
  const runtime = startDemoProcesses({ home, workspace: home, env: {}, port: '0', patchFiles: ['/one.yml', '/two.yml'] }, mock.spawn)
  assert.deepEqual(mock.calls[0].args.slice(0, 6), ['--profile', 'web', '--patch', '/one.yml', '--patch', '/two.yml'])
  mock.calls[0].child.stdout.write('dsh web: http://127.0.0.1:54189/?token=fake\n')
  assert.equal(readFileSync(resolve(home, 'url.txt'), 'utf8').trim(), 'http://127.0.0.1:54189/?token=fake')
  runtime.stop(0)
  assert.equal(await runtime.done, 0)
  assert.equal(mock.calls[0].child.signal, 'SIGTERM')
})
test('tunnel adds trusted origin, writes public URL and owns both children', async () => {
  const home = resolve('test-results/process-tunnel')
  mkdirSync(home, { recursive: true })
  const mock = fakeSpawner()
  const runtime = startDemoProcesses({ home, workspace: home, env: { PATH: resolve('.tools') }, port: '54180', tunnel: true }, mock.spawn)
  mock.calls[0].child.stderr.write('https://example-smoke.trycloudflare.com\n')
  assert.equal(mock.calls.length, 2)
  assert.ok(mock.calls[1].args.includes('example-smoke.trycloudflare.com'))
  mock.calls[1].child.stdout.write('dsh web: http://127.0.0.1:54180/?token=fake\n')
  assert.equal(readFileSync(resolve(home, 'public-url.txt'), 'utf8').trim(), 'https://example-smoke.trycloudflare.com/?token=fake')
  runtime.stop(0)
  assert.equal(await runtime.done, 0)
  assert.ok(mock.calls.every(call => call.child.signal === 'SIGTERM'))
})
