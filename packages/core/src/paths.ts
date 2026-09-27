/**
 * Single source of truth for the TraceScope data directory.
 *
 * Every report, attachment, remembered credential and remote clone lives
 * under one root. Previously each module hard-coded `~/.tracescope`; now they
 * all resolve through here so the location can be customised (e.g. moved off
 * the system drive) and existing data migrated.
 *
 * Resolution precedence (highest first):
 *   1. explicit `cacheRoot` argument on a call
 *   2. in-memory override (`setDataRootOverride`)
 *   3. `TRACESCOPE_HOME` environment variable
 *   4. pointer file `~/.tracescope.root.json`
 *   5. default `~/.tracescope`
 */
import os from 'node:os'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import {
  cp,
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'

const DATA_DIRNAME = '.tracescope'
const POINTER_BASENAME = '.tracescope.root.json'
const REPOS_DIRNAME = 'repos'

// Internal home-directory override. Only used to keep pointer/default-root
// tests isolated from the real user home (set directly via src, not public API).
let homeOverride: string | null = null

function homeDir(): string {
  return homeOverride ?? os.homedir()
}

/** Test-only: redirect the home used for the default root and pointer file. */
export function setHomedirForTests(dir: string | null): void {
  homeOverride = dir ? path.resolve(dir) : null
}

/** Test-only: clear all cached/override state between cases. */
export function resetPathsForTests(): void {
  homeOverride = null
  memoryRoot = null
  cachedPointer = undefined
}

export function defaultDataRoot(): string {
  return path.join(homeDir(), DATA_DIRNAME)
}

/** The pointer lives next to (not inside) the data dir so it survives a move. */
export function pointerFilePath(): string {
  return path.join(homeDir(), POINTER_BASENAME)
}

/** Subdirectory holding cached remote clones. */
export function reposDirFor(root: string): string {
  return path.join(root, REPOS_DIRNAME)
}

export function envDataRoot(): string | null {
  const v = (process.env.TRACESCOPE_HOME ?? '').trim()
  return v ? v : null
}

/** In-memory override (highest non-per-call precedence). */
let memoryRoot: string | null = null

export function setDataRootOverride(root: string | null | undefined): void {
  const t = typeof root === 'string' ? root.trim() : ''
  memoryRoot = t ? path.resolve(t) : null
}

interface PointerContent {
  dataRoot?: unknown
}

async function readPointer(): Promise<string | null> {
  try {
    const raw = JSON.parse(await readFile(pointerFilePath(), 'utf8')) as PointerContent
    const v = typeof raw.dataRoot === 'string' ? raw.dataRoot.trim() : ''
    return v ? path.resolve(v) : null
  } catch {
    return null
  }
}

// Cache the pointer once read so the common synchronous-style flows don't re-read.
let cachedPointer: string | null | undefined

function readPointerSync(): string | null {
  try {
    const raw = JSON.parse(readFileSync(pointerFilePath(), 'utf8')) as PointerContent
    const v = typeof raw.dataRoot === 'string' ? raw.dataRoot.trim() : ''
    return v ? path.resolve(v) : null
  } catch {
    return null
  }
}

/** Configured root ignoring a per-call override (env + pointer), or null for default. */
export async function configuredDataRoot(): Promise<string | null> {
  if (memoryRoot) return memoryRoot
  const env = envDataRoot()
  if (env) return path.resolve(env)
  if (cachedPointer === undefined) cachedPointer = await readPointer()
  return cachedPointer
}

/**
 * Synchronous resolution used by the many sync path helpers. Same precedence
 * as the async version; the pointer is read from disk with a cached value.
 */
export function dataRootSync(cacheRoot?: string | null): string {
  if (typeof cacheRoot === 'string' && cacheRoot.trim()) return path.resolve(cacheRoot.trim())
  if (memoryRoot) return memoryRoot
  const env = envDataRoot()
  if (env) return path.resolve(env)
  if (cachedPointer === undefined) cachedPointer = readPointerSync()
  return cachedPointer ?? defaultDataRoot()
}

/** Resolve the data root, honoring an explicit per-call override first. */
export async function resolveDataRoot(cacheRoot?: string | null): Promise<string> {
  if (typeof cacheRoot === 'string' && cacheRoot.trim()) return path.resolve(cacheRoot.trim())
  return (await configuredDataRoot()) ?? defaultDataRoot()
}

async function writePointer(root: string): Promise<void> {
  await mkdir(homeDir(), { recursive: true })
  await writeFile(
    pointerFilePath(),
    `${JSON.stringify({ dataRoot: root, savedAt: new Date().toISOString() }, null, 2)}\n`,
    'utf8',
  )
  cachedPointer = root
}

async function removePointer(): Promise<void> {
  try {
    await rm(pointerFilePath(), { force: true })
  } catch {
    /* ignore */
  }
  cachedPointer = null
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await stat(target)
    return true
  } catch {
    return false
  }
}

export interface ChangeDataRootResult {
  previousRoot: string
  dataRoot: string
  /** True when contents were copied from the old location. */
  migrated: boolean
}

/**
 * Point the data directory at a new location and move existing data there.
 *
 * Uses `fs.cp`, which copies across devices/filesystems, then removes the old
 * tree. When the target is the built-in default the pointer is deleted.
 */
export async function changeDataRoot(nextRoot: string): Promise<ChangeDataRootResult> {
  const target = path.resolve(String(nextRoot ?? '').trim())
  if (!String(nextRoot ?? '').trim()) throw new Error('数据目录不能为空')

  const previousRoot = await resolveDataRoot()
  if (target === previousRoot) {
    return { previousRoot, dataRoot: target, migrated: false }
  }

  const oldExists = await pathExists(previousRoot)
  await mkdir(target, { recursive: true })
  if (oldExists) {
    // Merge-copy across devices; overwrite any same-named files at the destination.
    await cp(previousRoot, target, { recursive: true, force: true })
  }

  if (target === defaultDataRoot()) {
    await removePointer()
  } else {
    await writePointer(target)
  }
  memoryRoot = target

  // Only remove the old tree after the pointer is in place and copy succeeded.
  if (oldExists) {
    await rm(previousRoot, { recursive: true, force: true })
  }

  return { previousRoot, dataRoot: target, migrated: oldExists }
}

/** Total on-disk size in bytes of a directory (recursive, best effort). */
export async function directorySize(root: string): Promise<number> {
  let total = 0
  async function walk(dir: string): Promise<void> {
    let entries: string[] = []
    try {
      entries = await readdir(dir)
    } catch {
      return
    }
    for (const name of entries) {
      const full = path.join(dir, name)
      try {
        const st = await stat(full)
        if (st.isDirectory()) await walk(full)
        else total += st.size
      } catch {
        /* ignore unreadable entries */
      }
    }
  }
  await walk(root)
  return total
}
