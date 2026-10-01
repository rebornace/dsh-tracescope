import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { analyzeImpact } from '../dist/analyze.js'
import { buildSourceIndexAtCommit, clearSourceIndexCache } from '../dist/deps.js'

const root = mkdtempSync(path.join(tmpdir(), 'ts-nm-bench-'))
const src = path.join(root, 'src')
const nm = path.join(root, 'node_modules', 'left-pad')
mkdirSync(src, { recursive: true })
mkdirSync(nm, { recursive: true })

for (let i = 0; i < 200; i++) {
  writeFileSync(path.join(src, `a${i}.ts`), `export const a${i} = ${i}\n`)
}
// Simulate a polluted git tree: thousands of dependency JS files tracked/listed.
for (let i = 0; i < 3000; i++) {
  writeFileSync(path.join(nm, `chunk${i}.js`), `module.exports = ${i}\n`)
}

function git(args) {
  execFileSync('git', args, { cwd: root, stdio: 'pipe' })
}
git(['init'])
git(['config', 'user.email', 't@e.com'])
git(['config', 'user.name', 't'])
git(['add', '.'])
git(['commit', '-m', 'b'])
const base = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim()
writeFileSync(path.join(src, 'a0.ts'), 'export const a0 = "changed"\n')
git(['add', '.'])
git(['commit', '-m', 'c'])
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim()

clearSourceIndexCache()
const t0 = performance.now()
const index = await buildSourceIndexAtCommit(root, head)
const indexMs = performance.now() - t0
const t1 = performance.now()
await analyzeImpact({ repoPath: root, baseCommit: base, headCommit: head })
const analyzeMs = performance.now() - t1
const t2 = performance.now()
await analyzeImpact({ repoPath: root, baseCommit: base, headCommit: head })
const cachedMs = performance.now() - t2

console.log(
  JSON.stringify(
    {
      indexedFiles: index.files.size,
      indexMs: Math.round(indexMs),
      analyzeMs: Math.round(analyzeMs),
      cachedAnalyzeMs: Math.round(cachedMs),
      note: 'node_modules should be excluded from indexedFiles',
    },
    null,
    2,
  ),
)
