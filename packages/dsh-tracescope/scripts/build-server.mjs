/**
 * Build the DSH server (Cordis plugin entry).
 *
 * `tsc` alone emits each module separately, so `dist/index.js` keeps a bare
 * `import "@rebornace/tracescope-core"`. That package is only linked inside
 * this workspace (pnpm junction); when DSH Desktop loads the installed plugin
 * from its own tree, Node cannot resolve the bare specifier and the plugin
 * fails to apply.
 *
 * Bundling with esbuild inlines `@rebornace/tracescope-core` (and its `yaml`
 * dependency) into the output. Node built-ins stay external because the host
 * supplies them. Two entries are built:
 *   - src/index.ts        -> dist/index.js        (plugin entry)
 *   - src/panel-server.ts -> dist/panel-server.js (standalone panel server)
 */
import { build } from 'esbuild'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const pkgDir = resolve(here, '..')

const entries = [
  { in: resolve(pkgDir, 'src/index.ts'), out: 'index.js' },
  { in: resolve(pkgDir, 'src/panel-server.ts'), out: 'panel-server.js' }]

const requireBanner = `import { createRequire as __createRequire } from 'node:module';
const require = __createRequire(import.meta.url);
`

for (const entry of entries) {
  const result = await build({
    entryPoints: [entry.in],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: ['node20'],
    banner: { js: requireBanner },
    // Node built-ins are external by default with platform 'node'. All real
    // packages (tracescope-core, yaml) are bundled in so the installed plugin
    // has no bare workspace dependency to resolve.
    external: [],
    jsx: 'automatic',
    charset: 'utf8',
    sourcemap: false,
    write: false,
    legalComments: 'none',
    logLevel: 'warning',
  })

  const chunk = result.outputFiles[0]
  if (!chunk) throw new Error(`esbuild produced no output for ${entry.out}`)

  const outPath = resolve(pkgDir, 'dist', entry.out)
  await mkdir(dirname(outPath), { recursive: true })
  await writeFile(outPath, chunk.text, 'utf8')
  console.log(`server bundle -> ${outPath} (${Buffer.byteLength(chunk.text)} bytes)`)
}
