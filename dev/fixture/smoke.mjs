import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { OpenUIFixtureAdapter, Config, apply } from './dist/index.js'
const home = new URL('../../test-results/fixture-smoke/', import.meta.url)
mkdirSync(home, { recursive: true })
const replyFile = fileURLToPath(new URL('reply.md', home))
const callsFile = fileURLToPath(new URL('calls.jsonl', home))
writeFileSync(replyFile, '本地回复 '.repeat(30))
writeFileSync(callsFile, '')
const config = Config({ replyFile, callsFile, paceMs: 0 })
assert.equal(Config({ replyFile, callsFile }).paceMs, 20)
assert.throws(() => apply({}, { ...config, replyFile: 'relative.md' }))
const adapter = new OpenUIFixtureAdapter(config)
assert.equal((await adapter.listModels('openui-fixture'))[0].id, 'openui-fixture')
const collect = async options => { const chunks = []; for await (const c of adapter.stream(options)) chunks.push(c); return chunks }
const chunks = await collect({ provider: 'openui-fixture', model: 'openui-fixture', messages: [], sessionId: 'smoke' })
assert.equal(chunks.filter(c => c.type === 'text-delta').map(c => c.text).join(''), readFileSync(replyFile, 'utf8'))
assert.equal(chunks.at(-1).reason.kind, 'stop')
assert.ok(chunks.every(c => c.blockType !== 'tool-call'))
writeFileSync(replyFile, 'changed reply')
const next = await collect({ messages: [] })
assert.equal(next.find(c => c.type === 'text-delta').text, 'changed reply')
const signal = AbortSignal.abort()
await assert.rejects(collect({ messages: [], signal }))
assert.equal(readFileSync(callsFile, 'utf8').trim().split('\n').length, 2)
console.log('PASS fixture: chunked text, per-call file read, call count=2, abort, no tools')
