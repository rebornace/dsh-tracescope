#!/usr/bin/env node
/**
 * One-command local desktop loop for TraceScope ↔ DeepSeek Harness.
 *
 *   pnpm dev          build once, link into desktop profile, watch & rebuild
 *   pnpm dev:link     only link local package into ~/.dsh/profiles/desktop
 *   pnpm dev:unlink   restore npm @rebornace/dsh-tracescope@0.3.6
 *
 * After a rebuild, refresh the TraceScope sidebar (or restart Harness if the
 * Host does not pick up the new dist).
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, watch } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const pluginDir = join(root, 'packages', 'dsh-tracescope')
const coreDir = join(root, 'packages', 'core')
const profileDir = join(homedir(), '.dsh', 'profiles', 'desktop')
const profilePkg = join(profileDir, 'package.json')
const linkSpec = `link:${pluginDir.replace(/\\/g, '/')}`
const npmSpec = '0.3.6'
const scopedName = '@rebornace/dsh-tracescope'

const cmd = (process.argv[2] || 'watch').trim()

function log(msg) {
  const ts = new Date().toLocaleTimeString()
  console.log(`[dev-desktop ${ts}] ${msg}`)
}

function run(command, args, opts = {}) {
  const result = spawnSync(command, args, {
    cwd: opts.cwd || root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env,
  })
  if (result.status !== 0 && !opts.allowFail) {
    throw new Error(`${command} ${args.join(' ')} failed (exit ${result.status ?? 'null'})`)
  }
  return result.status ?? 1
}

function harnessRunning() {
  if (process.platform !== 'win32') return false
  const r = spawnSync('tasklist', ['/FI', 'IMAGENAME eq DeepSeek Harness.exe'], {
    encoding: 'utf8',
    shell: true,
  })
  return /DeepSeek Harness\.exe/i.test(r.stdout || '')
}

function ensureProfileDir() {
  if (!existsSync(profilePkg)) {
    throw new Error(
      `Desktop profile not found at ${profileDir}. Open DeepSeek Harness once, then retry.`,
    )
  }
}

async function readProfile() {
  ensureProfileDir()
  return JSON.parse(await readFile(profilePkg, 'utf8'))
}

async function writeProfile(manifest) {
  await writeFile(profilePkg, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
}

function dshAvailable() {
  const r = spawnSync('dsh', ['--version'], { encoding: 'utf8', shell: true })
  return r.status === 0
}

async function linkLocal() {
  ensureProfileDir()
  if (!existsSync(join(pluginDir, 'package.json'))) {
    throw new Error(`Missing ${pluginDir}/package.json — restore packages/dsh-tracescope first`)
  }
  if (!existsSync(join(pluginDir, 'dist', 'index.js'))) {
    log('dist missing — building once before link')
    await buildAll()
  }
  if (harnessRunning()) {
    log('DeepSeek Harness is running — close it if link/install hits EPERM')
  }

  if (dshAvailable()) {
    // Prefer official plugin CLI so bundles stay reconciled.
    run('dsh', ['plugin', '--profile', 'desktop', 'remove', scopedName], {
      cwd: profileDir,
      allowFail: true,
    })
    run(
      'dsh',
      ['plugin', '--profile', 'desktop', 'add', `${scopedName}@${linkSpec}`],
      { cwd: profileDir },
    )
  } else {
    log('dsh CLI not on PATH — writing package.json link directly, then pnpm install')
    const manifest = await readProfile()
    manifest.dependencies = {
      ...(manifest.dependencies || {}),
      [scopedName]: linkSpec,
    }
    const bundles = manifest.dsh?.profile?.bundles ?? []
    if (!bundles.includes(scopedName)) {
      manifest.dsh = manifest.dsh || {}
      manifest.dsh.profile = manifest.dsh.profile || {}
      manifest.dsh.profile.bundles = [...bundles, scopedName]
    }
    await writeProfile(manifest)
    run('pnpm', ['install'], { cwd: profileDir })
  }

  const linked = join(profileDir, 'node_modules', '@rebornace', 'dsh-tracescope', 'package.json')
  if (!existsSync(linked)) {
    throw new Error('Link failed — node_modules/@rebornace/dsh-tracescope missing')
  }
  log(`linked ${scopedName} → ${pluginDir}`)
  log('Restart DeepSeek Harness, then keep this watcher running while you edit.')
}

async function unlinkLocal() {
  ensureProfileDir()
  if (harnessRunning()) {
    log('DeepSeek Harness is running — close it if uninstall hits EPERM')
  }
  if (dshAvailable()) {
    run('dsh', ['plugin', '--profile', 'desktop', 'remove', scopedName], { cwd: profileDir })
    run(
      'dsh',
      ['plugin', '--profile', 'desktop', 'add', `${scopedName}@${npmSpec}`],
      { cwd: profileDir },
    )
  } else {
    const manifest = await readProfile()
    manifest.dependencies = {
      ...(manifest.dependencies || {}),
      [scopedName]: npmSpec,
    }
    await writeProfile(manifest)
    run('pnpm', ['install'], { cwd: profileDir })
  }
  log(`restored ${scopedName}@${npmSpec} from npm`)
}

function buildCore() {
  run('pnpm', ['--filter', '@rebornace/tracescope-core', 'build'])
}

function buildServer() {
  run('node', ['scripts/build-server.mjs'], { cwd: pluginDir })
}

function buildClient() {
  run('node', ['scripts/build-client.mjs'], { cwd: pluginDir })
}

async function buildAll() {
  buildCore()
  // Skip dts emit in the hot path — server/client esbuild is what Desktop loads.
  buildServer()
  buildClient()
  log('build ok')
}

function isLinked() {
  try {
    const raw = JSON.parse(readFileSync(profilePkg, 'utf8'))
    const spec = raw?.dependencies?.[scopedName]
    return typeof spec === 'string' && spec.startsWith('link:')
  } catch {
    return false
  }
}

async function ensureLinked() {
  if (isLinked()) {
    log('desktop profile already on local link')
    return
  }
  log('desktop profile not linked — linking now')
  await linkLocal()
}

function watchAndRebuild() {
  let timer = null
  let building = false
  let pending = new Set()

  const schedule = (kind) => {
    pending.add(kind)
    if (timer) clearTimeout(timer)
    timer = setTimeout(runPending, 250)
  }

  const runPending = () => {
    if (building) {
      timer = setTimeout(runPending, 200)
      return
    }
    const kinds = pending
    pending = new Set()
    building = true
    const started = Date.now()
    try {
      const needCore = kinds.has('core')
      const needServer = needCore || kinds.has('server')
      const needClient = kinds.has('client')
      if (needCore) buildCore()
      if (needServer) buildServer()
      if (needClient) buildClient()
      log(`rebuilt in ${Date.now() - started}ms — refresh TraceScope (restart Harness if needed)`)
    } catch (err) {
      console.error(err instanceof Error ? err.message : err)
      log('rebuild failed — fix the error, watcher keeps running')
    } finally {
      building = false
    }
  }

  const ignore = (filePath) => {
    const p = filePath.replace(/\\/g, '/')
    return (
      p.includes('/node_modules/') ||
      p.includes('/dist/') ||
      p.includes('/client/client.js') ||
      p.endsWith('.map')
    )
  }

  const onChange = (kind) => (event, filename) => {
    if (!filename) return
    const name = String(filename).replace(/\\/g, '/')
    if (ignore(name) && !name.includes('client-src/') && !name.includes('/src/')) return
    schedule(kind)
  }

  watch(join(coreDir, 'src'), { recursive: true }, onChange('core'))
  watch(join(pluginDir, 'src'), { recursive: true }, onChange('server'))
  watch(join(pluginDir, 'client-src'), { recursive: true }, onChange('client'))
  if (existsSync(join(pluginDir, 'cordis.patch.yml'))) {
    watch(join(pluginDir, 'cordis.patch.yml'), () => schedule('server'))
  }

  log('watching core/src + dsh-tracescope/src + client-src')
  log('edit code freely; Ctrl+C to stop')
}

async function main() {
  if (cmd === 'link') {
    await linkLocal()
    return
  }
  if (cmd === 'unlink') {
    await unlinkLocal()
    return
  }
  if (cmd === 'build' || cmd === 'once') {
    await buildAll()
    await ensureLinked()
    return
  }
  if (cmd === 'watch' || cmd === 'dev') {
    await buildAll()
    await ensureLinked()
    watchAndRebuild()
    return
  }

  console.error(`Unknown command: ${cmd}
Usage:
  pnpm dev           build + link + watch
  pnpm dev:link      link local package into desktop
  pnpm dev:unlink    restore npm ${scopedName}@${npmSpec}`)
  process.exit(1)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
