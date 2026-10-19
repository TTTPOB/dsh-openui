/** Discover the installed Host's existing public shared packages. */
import { createRequire } from 'node:module'
import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

export function hostRequire() {
  let runtime = process.env.OPENUI_FIXTURE_RUNTIME
  if (runtime === undefined) {
    const projects = JSON.parse(execFileSync('pnpm', ['list', '-g', '--depth', '-1', '--json'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    }))
    runtime = projects.map(project => project.dependencies?.['@deepseek-ai/dsh']?.path).find(Boolean)
  }
  if (typeof runtime !== 'string' || runtime.length === 0) {
    throw new Error('Cannot discover installed @deepseek-ai/dsh; set OPENUI_FIXTURE_RUNTIME to its package directory')
  }
  return createRequire(resolve(realpathSync(runtime), 'package.json'))
}
