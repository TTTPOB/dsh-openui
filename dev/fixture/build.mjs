import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { pathToFileURL } from 'node:url'
import { hostRequire } from './runtime.mjs'
let output = stripTypeScriptTypes(readFileSync(new URL('./src/index.ts', import.meta.url), 'utf8'), { mode: 'transform' })
const require = hostRequire()
for (const name of ['@deepseek-ai/dsh-llm', '@deepseek-ai/schemastery']) {
  output = output.replaceAll("'" + name + "'", JSON.stringify(pathToFileURL(require.resolve(name)).href))
}
mkdirSync(new URL('./dist/', import.meta.url), { recursive: true })
writeFileSync(new URL('./dist/index.js', import.meta.url), output)
console.log('Built openui-fixture using installed Host public peers')
