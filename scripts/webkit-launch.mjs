#!/usr/bin/env node
/** Launch bundled Linux WebKit with repository-local optional shared libraries. */
import { webkit } from '@playwright/test'
import { spawn } from 'node:child_process'
import { dirname, resolve, join } from 'node:path'
const bundle = join(dirname(webkit.executablePath()), 'minibrowser-wpe')
const child = spawn(join(bundle, 'bin/MiniBrowser'), process.argv.slice(2), {
  stdio: ['inherit', 'inherit', 'inherit', 3, 4], env: { ...process.env,
    WEBKIT_EXEC_PATH: join(bundle, 'bin'),
    WEBKIT_INJECTED_BUNDLE_PATH: join(bundle, 'lib'),
    WEBKIT_INSPECTOR_RESOURCES_PATH: join(bundle, 'share'),
    WEBKIT_FORCE_COMPLEX_TEXT: '1',
    LD_LIBRARY_PATH: [join(bundle, 'lib'), join(bundle, 'sys/lib'), resolve('.tools/webkit-deps/usr/lib/x86_64-linux-gnu'), process.env.LD_LIBRARY_PATH].filter(Boolean).join(':'),
  },
})
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
child.on('error', error => { console.error(error); process.exitCode = 1 })
child.on('exit', code => { process.exitCode = code ?? 1 })
