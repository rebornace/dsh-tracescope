import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { analyzeImpact } from '../dist/analyze.js'
import { buildIndexFromFileMap, buildSourceIndexAtCommit } from '../dist/deps.js'

const root = mkdtempSync(path.join(tmpdir(), 'ts-bench-'))
const src = path.join(root, 'src')
mkdirSync(src, { recursive: true })

const N = Number(process.env.BENCH_FILES || 800)
for (let i = 0; i < N; i++) {
  const dir = path.join(src, `mod${i % 40}`)
  mkdirSync(dir, { recursive: true })
  const next = (i + 1) % N
  writeFileSync(
    path.join(dir, `file${i}.ts`),
    [
      `import { x } from "../mod${next % 40}/file${next}";`,
      `export const Comp${i} = () => null;`,
      `export class Widget${i} {}`,
    ].join('\n'),
  )
}
writeFileSync(
  path.join(src, 'App.vue'),
  '<template><Comp0/></template><script>import Comp0 from "./mod0/file0";</script>',
)

function git(args) {
  execFileSync('git', args, { cwd: root, stdio: 'pipe' })
}
git(['init'])
git(['config', 'user.email', 't@e.com'])
git(['config', 'user.name', 't'])
git(['add', '.'])
git(['commit', '-m', 'b'])
const base = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim()
writeFileSync(path.join(src, 'mod0', 'file0.ts'), 'export const Comp0 = () => "changed";\n')
git(['add', '.'])
git(['commit', '-m', 'c'])
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim()

const tIndex0 = performance.now()
const index = await buildSourceIndexAtCommit(root, head)
const indexMs = performance.now() - tIndex0

const tBuild0 = performance.now()
buildIndexFromFileMap(new Map(index.files))
const rebuildMs = performance.now() - tBuild0

const t0 = performance.now()
const report = await analyzeImpact({
  repoPath: root,
  baseCommit: base,
  headCommit: head,
  rippleDepth: 2,
})
const ms = performance.now() - t0

console.log(
  JSON.stringify(
    {
      files: index.files.size,
      indexMs: Math.round(indexMs),
      rebuildMs: Math.round(rebuildMs),
      analyzeMs: Math.round(ms),
      changed: report.changedFiles.length,
      direct: report.direct.length,
      ripple: report.ripple.length,
    },
    null,
    2,
  ),
)
