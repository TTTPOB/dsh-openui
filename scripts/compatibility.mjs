/** Derive exact exemptions from this isolated Host's own startup diagnostics. */
import { spawn } from 'node:child_process'
import { join } from 'node:path'
export async function grantDemoCompatibility({ home, workspace, env, run }) {
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
    run('dsh', ['plugin', '--profile', 'web', 'allow-version', identity, '--dsh-version', version, '--accept-risk'])
  }
}
