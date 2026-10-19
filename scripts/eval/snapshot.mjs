#!/usr/bin/env node
/** Freeze the current dsh-openui build into an eval-only snapshot. */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const { values } = parseArgs({ options: {
  source: { type: 'string', default: 'packages/dsh-openui' },
  out: { type: 'string', default: '.demo-home/eval/snapshot/dsh-openui' },
} })
const source = resolve(ROOT, values.source)
const out = resolve(ROOT, values.out)
if (!out.startsWith(join(ROOT, '.demo-home', 'eval') + '/')) throw new Error('snapshot must stay under .demo-home/eval')
for (const file of ['dist/index.js', 'dist/client.js', 'dist/island.js', 'dist/openui-skill.md', 'package.json', 'cordis.patch.yml']) {
  if (!existsSync(join(source, file))) throw new Error('missing source artifact ' + join(source, file))
}
rmSync(out, { recursive: true, force: true })
mkdirSync(join(out, 'dist'), { recursive: true, mode: 0o700 })
cpSync(join(source, 'dist'), join(out, 'dist'), { recursive: true })
cpSync(join(source, 'package.json'), join(out, 'package.json'))
cpSync(join(source, 'cordis.patch.yml'), join(out, 'cordis.patch.yml'))
let commit = null
let dirty = null
try { commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim() } catch {}
try { dirty = execFileSync('git', ['status', '--short'], { cwd: ROOT, encoding: 'utf8' }).trim() !== '' } catch {}
const hash = file => createHash('sha256').update(readFileSync(join(out, file))).digest('hex')
const meta = {
  commit,
  dirty,
  createdAt: new Date().toISOString(),
  source: values.source,
  snapshot: values.out,
  sha256: {
    'dist/index.js': hash('dist/index.js'),
    'dist/client.js': hash('dist/client.js'),
    'dist/island.js': hash('dist/island.js'),
    'dist/openui-skill.md': hash('dist/openui-skill.md'),
  },
}
writeFileSync(join(out, 'snapshot.json'), JSON.stringify(meta, null, 2) + '\n', { mode: 0o644 })
console.log(JSON.stringify(meta, null, 2))
