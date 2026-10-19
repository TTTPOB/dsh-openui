/** Deterministic local provider; optional check-tool probes are explicitly configured. */
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { LlmAdapter, ToolCallId } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { readFileSync, appendFileSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

export const name = 'openui-fixture'
export const inject = ['llm']
export interface Config { replyFile: string; callsFile: string; paceMs: number; checkSources?: string[]; checkMode?: 'native' | 'ptc' }
export const Config = Schema.object({
  replyFile: Schema.string().required(),
  callsFile: Schema.string().required(),
  paceMs: Schema.number().default(20),
  checkSources: Schema.array(Schema.string()),
  checkMode: Schema.union(['native', 'ptc']).default('native'),
})
export class OpenUIFixtureAdapter extends LlmAdapter {
  constructor(private readonly config: Config) { super() }
  override providerInfo(provider: string) { return { id: provider, name: 'OpenUI Fixture (local)' } }
  override async listModels(provider: string) { return [{ provider, id: 'openui-fixture', name: 'OpenUI Fixture' }] }
  override async resolveModel(provider: string, model: string) {
    if (model !== 'openui-fixture') throw new Error('Unknown fixture model: ' + model)
    return { ...(await this.listModels(provider))[0], context: { contextWindow: 131072 } }
  }
  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const started = performance.now()
    options.signal?.throwIfAborted()
    const lastUser = options.messages.findLastIndex(message => message.role === 'user')
    const prefix = 'openui-fixture-check-' + lastUser + '-'
    const toolMessages = options.messages.slice(lastUser + 1).filter(message => message.role === 'tool' && message.source?.kind === 'tool' && String(message.source.callId).startsWith(prefix))
    const checkLog = this.config.checkSources?.length ? { toolMessages, toolNames: options.tools?.map(tool => tool.name) ?? [], sdkMentionsOpenUICheck: options.system?.includes('openui_check') || options.messages.some(message => message.role === 'system' && message.content.some(block => block.type === 'text' && block.text.includes('openui_check'))) } : undefined
    if (checkLog) console.log('[fixture-check] ' + JSON.stringify({ toolNames: checkLog.toolNames, sdkMentionsOpenUICheck: checkLog.sdkMentionsOpenUICheck }))
    appendFileSync(this.config.callsFile, JSON.stringify({ at: new Date().toISOString(), sessionId: options.sessionId, purpose: options.purpose, ...checkLog }) + '\n')
    const checked = toolMessages.length > 0
    if (this.config.checkSources?.length && !checked) {
      for (const [index, source] of this.config.checkSources.entries()) {
        const id = ToolCallId(prefix + index)
        const name = this.config.checkMode === 'ptc' ? 'run_code' : 'openui_check'
        const args = JSON.stringify(this.config.checkMode === 'ptc' ? { code: 'return await tools.openui_check(' + JSON.stringify({ source }) + ');', description: 'Check OpenUI source' } : { source })
        yield { type: 'block-start', index, blockType: 'tool-call' }
        yield { type: 'tool-call-delta', index, id, name, argumentsDelta: args }
        yield { type: 'block-end', index, block: { type: 'tool-call', id, name, arguments: args } }
      }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }
    const text = readFileSync(this.config.replyFile, 'utf8')
    yield { type: 'block-start', index: 0, blockType: 'text' }
    for (let offset = 0; offset < text.length; offset += 72) {
      options.signal?.throwIfAborted()
      if (this.config.paceMs) await delay(this.config.paceMs, undefined, { signal: options.signal })
      yield { type: 'text-delta', index: 0, text: text.slice(offset, offset + 72) }
    }
    yield { type: 'block-end', index: 0, block: { type: 'text', text } }
    yield { type: 'usage', usage: { inputTokens: 128, outputTokens: Math.ceil(text.length / 2) } }
    console.log('[timing] fixture-text=' + (performance.now() - started).toFixed(1) + 'ms; chars=' + text.length + '; paceMs=' + this.config.paceMs)
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}
export function apply(ctx: Context, config: Config): void {
  if (!isAbsolute(config.replyFile) || !isAbsolute(config.callsFile)) throw new Error('Fixture paths must be absolute')
  if (!Number.isInteger(config.paceMs) || config.paceMs < 0 || config.paceMs > 1000) throw new Error('Invalid paceMs')
  ctx.llm.registerAdapter(['openui-fixture'], new OpenUIFixtureAdapter(config))
}
