import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dir = __dirname

async function load(mod) {
  return (await import(pathToFileURL(mod).href)).default
}

const zhParts = [
  'loading-findings.js',
  'diff-core.js',
  'errors-visual.js',
  'mapping.js',
  'diff-board.js',
  'prompt.js',
]
const enParts = [
  'loading-findings.en.js',
  'diff-core.en.js',
  'errors-visual.en.js',
  'mapping.en.js',
  'diff-board.en.js',
  'prompt.en.js',
]

async function merge(parts) {
  let out = {}
  for (const p of parts) {
    out = { ...out, ...(await load(path.join(dir, p))) }
  }
  return out
}

function writeModule(file, obj) {
  const lines = Object.entries(obj).map(([k, v]) => `  '${k}': ${JSON.stringify(v)},`)
  fs.writeFileSync(
    file,
    `/** @type {Record<string, string>} */\nexport default {\n${lines.join('\n')}\n}\n`,
    'utf8',
  )
}

const zh = await merge(zhParts)
const en = await merge(enParts)
const zk = Object.keys(zh)
const ek = Object.keys(en)
const miss = zk.filter((k) => !(k in en))
if (miss.length) {
  console.error('missing en keys', miss.slice(0, 10))
  process.exit(1)
}
writeModule(path.join(dir, '../visual-namespaced-ui-zh.js'), zh)
writeModule(path.join(dir, '../visual-namespaced-ui-en.js'), en)
console.log('ui keys', zk.length)
