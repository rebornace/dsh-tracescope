/**
 * Build the MCP / local panel SPA (full TraceScope workbench = DSH sidebar UI).
 * Bundles client-src/entry.js + React into panel/standalone.js.
 */
import { build } from 'esbuild'
import { mkdir, writeFile, copyFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'

const here = dirname(fileURLToPath(import.meta.url))
const pkgDir = resolve(here, '..')
const ENTRY = resolve(pkgDir, 'client-src/entry.js')
const OUT_DIR = resolve(pkgDir, 'panel')
const OUT_JS = resolve(OUT_DIR, 'standalone.js')
const OUT_HTML = resolve(OUT_DIR, 'index.html')

await mkdir(OUT_DIR, { recursive: true })

// Archive previous vanilla panel assets once (optional).
const legacyApp = resolve(OUT_DIR, 'app.js')
const legacyDir = resolve(OUT_DIR, 'legacy')
if (existsSync(legacyApp) && !existsSync(resolve(legacyDir, 'app.js'))) {
  await mkdir(legacyDir, { recursive: true })
  for (const name of ['app.js', 'i18n.js', 'styles.css', 'index.html']) {
    const src = resolve(OUT_DIR, name)
    if (existsSync(src) && name !== 'index.html') {
      await copyFile(src, resolve(legacyDir, name))
    }
  }
  // Save previous index as legacy if it still looks like the old form page.
  const prevHtml = resolve(OUT_DIR, 'index.html')
  if (existsSync(prevHtml)) {
    const { readFile } = await import('node:fs/promises')
    const text = await readFile(prevHtml, 'utf8')
    if (text.includes('btnLoadCommits') || text.includes('app.js')) {
      await writeFile(resolve(legacyDir, 'index.html'), text, 'utf8')
    }
  }
}

const result = await build({
  entryPoints: [ENTRY],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome110'],
  external: [],
  jsx: 'automatic',
  charset: 'utf8',
  write: false,
  legalComments: 'none',
  logLevel: 'warning',
  banner: {
    // Must be set before entry.js evaluates so mountStandalone boot runs.
    js: 'window.__TRACESCOPE_STANDALONE__=true;\n',
  },
})

const chunk = result.outputFiles[0]
if (!chunk) throw new Error('esbuild produced no standalone output')
await writeFile(OUT_JS, chunk.text, 'utf8')

await writeFile(
  OUT_HTML,
  `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>TraceScope</title>
    <style>
      html, body { margin: 0; height: 100%; background: #f7f2e8; }
      #root { height: 100%; min-height: 0; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script src="./standalone.js"></script>
  </body>
</html>
`,
  'utf8',
)

console.log(`standalone panel -> ${OUT_JS} (${Buffer.byteLength(chunk.text)} bytes)`)
console.log(`standalone html  -> ${OUT_HTML}`)
