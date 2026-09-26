/**
 * Build the DSH sidebar client.
 *
 * Sidebar source lives as ordinary modules under `client-src/`. esbuild bundles
 * them into one script; React and its JSX runtime remain external because the
 * DSH ModuleLoader supplies them at runtime by package name. The output is
 * wrapped in the lazy-CJS `__ModuleLoader__.load` entry DSH expects, producing
 * `client/client.js`.
 */
import { build } from 'esbuild'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'


const here = dirname(fileURLToPath(import.meta.url))
const pkgDir = resolve(here, '..')
const ENTRY = resolve(pkgDir, 'client-src/entry.js')
const OUT = resolve(pkgDir, 'client/client.js')

const PLUGIN_ID = '@rebornace/dsh-tracescope'

const banner = `//! DSH lazy-CJS client entry (React Slot). Bundled from client-src/ by scripts/build-client.mjs.
//! Factory arity must be \`(require) => exports\`.
//! Same-origin Host APIs: /tracescope/v1/*
window.__ModuleLoader__.load({
  id: '${PLUGIN_ID}',
  factory: (require) => {
`

const footer = `
    return module.exports
  },
})
`

const result = await build({
  entryPoints: [ENTRY],
  bundle: true,
  // CJS emits plain top-level statements (no wrapper to strip). Externals stay
  // as require("x") calls that resolve to the DSH factory's `require` param.
  // The final `return module.exports` is appended as raw text in the footer,
  // so esbuild never parses a top-level return.
  format: 'cjs',
  platform: 'browser',
  target: ['chrome110'],
  external: ['react', 'react/jsx-runtime'],
  jsx: 'automatic',
  charset: 'utf8',
  write: false,
  legalComments: 'none',
  logLevel: 'warning',
})

const chunk = result.outputFiles[0]
if (!chunk) throw new Error('esbuild produced no output')

const finalText = banner + chunk.text + footer
await mkdir(dirname(OUT), { recursive: true })
await writeFile(OUT, finalText, 'utf8')
console.log(`client bundle -> ${OUT} (${Buffer.byteLength(finalText)} bytes)`)
