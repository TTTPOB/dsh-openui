#!/usr/bin/env node
/** Run the model matrix sequentially with one isolated host per model. */
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const { values } = parseArgs({ options: {
  model: { type: 'string', multiple: true, default: [] },
  out: { type: 'string' },
  case: { type: 'string', multiple: true, default: [] },
  limit: { type: 'string' },
  fresh: { type: 'boolean', default: false },
  headed: { type: 'boolean', default: false },
  timeout: { type: 'string', default: '180000' },
  sourceHome: { type: 'string' },
} })

const defaults = ['deepseek-official/deepseek-flash', 'klaude-openai/gpt-6.1-sol']
const models = (values.model.length > 0 ? values.model : defaults).map(value => {
  const slash = value.indexOf('/')
  if (slash <= 0 || slash === value.length - 1) throw new Error('--model must be provider/model: ' + value)
  return { provider: value.slice(0, slash), model: value.slice(slash + 1) }
})
const date = new Date().toISOString().slice(0, 10)
const out = values.out ?? 'docs/evidence/eval-' + date + '.jsonl'
const common = []
for (const item of values.case) common.push('--case', item)
if (values.limit !== undefined) common.push('--limit', values.limit)
if (values.headed) common.push('--headed')
common.push('--timeout', values.timeout)
if (values.sourceHome !== undefined) common.push('--sourceHome', values.sourceHome)

for (const model of models) {
  const args = ['scripts/eval/run.mjs', '--provider', model.provider, '--model', model.model,
    '--out', out, ...common]
  if (values.fresh) args.push('--fresh')
  console.error('eval: running ' + model.provider + '/' + model.model)
  const result = spawnSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error('eval run failed for ' + model.provider + '/' + model.model + ' (exit ' + result.status + ')')
}
const report = spawnSync(process.execPath, ['scripts/eval/report.mjs', '--input', out], { cwd: ROOT, stdio: 'inherit' })
if (report.error) throw report.error
if (report.status !== 0) throw new Error('report failed (exit ' + report.status + ')')
