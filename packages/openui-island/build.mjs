import { build } from 'esbuild';
import { mkdir, writeFile, stat, readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
const base = fileURLToPath(new URL('.', import.meta.url));
const out = resolve(base, process.env.OPENUI_OUT_DIR ?? 'dist');
await mkdir(out, { recursive: true });
const common = { absWorkingDir: base, bundle: true, platform: 'browser', format: 'esm', target: 'es2022', jsx: 'automatic', loader: { '.css': 'text' }, define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'info' };
const result = await build({ ...common, entryPoints: ['src/index.tsx'], outfile: resolve(out, 'island.js'), minify: true, metafile: true });
const external = Object.values(result.metafile.outputs).flatMap(output => output.imports).filter(item => item.external);
if (external.length) throw new Error('External imports: ' + JSON.stringify(external));
await build({ ...common, platform: 'node', entryPoints: ['src/catalog.tsx'], outfile: resolve(out, 'catalog.mjs') });
const { library } = await import(pathToFileURL(resolve(out, 'catalog.mjs')).href);
await writeFile(resolve(out, 'library.schema.json'), JSON.stringify(library.toJSONSchema(), null, 2) + '\n');
await writeFile(resolve(out, 'prompt.md'), library.prompt({ bindings: true, builtinFunctions: false, inlineMode: false, toolCalls: false,
  preamble: '# OpenUI skill for DSH\nUse this reference when an interactive local calculator or control benefits the user. Normal Markdown may appear before or after a UI fence; do not turn ordinary coding answers into UI. Each openui-lang fence is an independent complete program, not an edit to a previous block.',
  examples: [await readFile(resolve(base, 'examples/loan.openui'), 'utf8'), await readFile(resolve(base, 'examples/functions.openui'), 'utf8')],
  additionalRules: [
    'Output interactive UI in an openui-lang Markdown fence. Include a complete root and all definitions in every fence. Do not add discovery markers; the fence language is sufficient.',
    'Complex UI may be checked with openui_check before output. This is optional validation, not an automatic repair loop.',
    'Use only local reactive state for calculations. Do not use Query, Mutation, external actions, network access, or model calls.',
    'Use UI only when interaction helps the task; keep code, commands, logs, diffs and troubleshooting as ordinary Markdown.',
    'Prefer Grid with Metric for key results, generic tone negative/warning/positive for status, Row for local controls, Table for comparisons, and Chart for a numeric trend. Pass formulas, not hardcoded outcomes.',
  ],
}));
const bytes = (await stat(resolve(out, 'island.js'))).size;
console.log(JSON.stringify({ out, bytes, gzipBytes: gzipSync(await readFile(resolve(out, 'island.js'))).length, externalImports: external.length }));
