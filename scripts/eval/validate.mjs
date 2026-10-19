#!/usr/bin/env node
/** Validate the model-agnostic eval prompt set without contacting a model. */
import { readFileSync } from 'node:fs'

const file = new URL('./prompts.json', import.meta.url)
const data = JSON.parse(readFileSync(file, 'utf8'))
const groups = data.groups ?? {}
const errors = []
const ids = new Set()
const required = ['id', 'domain', 'prompt', 'expect']
const forbidden = /deepseek|claude|gpt|klaude|openai|openui-lang/i

for (const group of ['should-ui', 'should-not-ui']) {
  const cases = groups[group]
  if (!Array.isArray(cases)) { errors.push('missing group ' + group); continue }
  if (cases.length < 10) errors.push(group + ' needs at least 10 cases, got ' + cases.length)
  for (const item of cases) {
    for (const key of required) {
      if (typeof item[key] !== 'string' || item[key].trim() === '') errors.push((item.id ?? '?') + ': missing ' + key)
    }
    if (ids.has(item.id)) errors.push('duplicate id ' + item.id)
    ids.add(item.id)
    if (/openui/i.test(item.prompt)) errors.push(item.id + ': prompt should describe the task, not the DSL')
    if (forbidden.test(item.prompt)) errors.push(item.id + ': prompt mentions a model/vendor')
  }
}

if (errors.length > 0) {
  console.error(errors.join('\n'))
  process.exit(1)
}
console.log(JSON.stringify({ ok: true, groups: Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.length])), total: ids.size }))
