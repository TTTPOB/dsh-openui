/** Derive exact exemptions from this isolated Host's own startup diagnostics. */
import { spawn } from 'node:child_process'
import { delimiter, join } from 'node:path'
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
export async function grantDemoCompatibility({ home, workspace, env, run, refresh = false }) {
  const stamp = join(home, 'compatibility-stamp.json')
  const executable = (env.PATH ?? '').split(delimiter).map(dir => join(dir, 'dsh')).find(path => existsSync(path))
  const fingerprint = () => createHash('sha256').update(realpathSync(executable)).update(readFileSync(join(home, 'profiles/web/package.json'))).digest('hex')
  if (!refresh && existsSync(stamp) && JSON.parse(readFileSync(stamp, 'utf8')).fingerprint === fingerprint()) {
    console.log('[timing] compatibility-probe=0ms (same runtime and profile)')
    return
  }
  const output = await new Promise((resolve, reject) => {
    let text = ''
    const child = spawn('dsh', ['--profile', 'web', '--patch', join(home, 'fixture.patch.yml'), '--host', '127.0.0.1', '--port', '0', '--no-open'], { cwd: workspace, env, stdio: ['ignore', 'pipe', 'pipe'] })
    const timeout = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Compatibility probe timed out')) }, 20000)
    child.on('error', reject)
    for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => {
      text += chunk
      if (text.includes('dsh web: http')) child.kill('SIGTERM')
    })
    child.on('close', () => { clearTimeout(timeout); resolve(text) })
  })
  const identities = [...new Set([...output.matchAll(/Plugin (@deepseek-ai\/[^\s]+@[^\s]+) is incompatible with dsh ([^:]+):/g)].map(m => JSON.stringify([m[1], m[2]])))].map(x => JSON.parse(x))
  for (const [identity, version] of identities) {
    console.warn('Isolated demo ONLY: accepting exact compatibility risk for ' + identity + ' on ' + version)
    run('dsh', ['plugin', '--profile', 'web', 'allow-version', identity, '--dsh-version', version, '--accept-risk'], 'inherit', 'allow-version')
  }
  writeFileSync(stamp, JSON.stringify({ fingerprint: fingerprint() }) + '\n')
}
