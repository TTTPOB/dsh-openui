/** Grant exact-version exemptions in one isolated eval home only. */
import { spawn, spawnSync } from 'node:child_process'
import { join } from 'node:path'

function run(command, args, env, cwd) {
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf8' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(command + ' exited ' + result.status + ': ' + String(result.stderr ?? '').slice(-1000))
  return result
}

export async function grantCompatibility({ home, workspace, env, patchFiles }) {
  const args = ['--profile', 'web', ...patchFiles.flatMap(path => ['--patch', path]),
    '--host', '127.0.0.1', '--port', '0', '--no-open']
  const output = await new Promise((resolve, reject) => {
    let text = ''
    const child = spawn('dsh', args, { cwd: workspace, env, stdio: ['ignore', 'pipe', 'pipe'] })
    const timeout = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('compatibility probe timed out')) }, 30000)
    const collect = chunk => { text += chunk; if (text.includes('dsh web: http')) child.kill('SIGTERM') }
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)
    child.on('error', reject)
    child.on('close', () => { clearTimeout(timeout); resolve(text) })
  })
  const identities = [...new Set([...output.matchAll(/Plugin (@deepseek-ai\/[^\s]+@[^\s]+) is incompatible with dsh ([^:]+):/g)]
    .map(match => JSON.stringify([match[1], match[2]])))].map(value => JSON.parse(value))
  for (const [identity, version] of identities) {
    console.warn('eval ONLY: accepting exact compatibility risk for ' + identity + ' on ' + version)
    run('dsh', ['plugin', '--profile', 'web', 'allow-version', identity,
      '--dsh-version', version, '--accept-risk'], env, workspace)
  }
  return identities
}
