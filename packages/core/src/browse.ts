/**
 * Filesystem browsing helpers powering the visual folder picker.
 *
 * The sidebar webview cannot reliably open a native directory dialog, so the
 * panel renders its own picker and asks the host (which has full disk access)
 * to enumerate volumes and the subfolders of a given path.
 */
import { access, readdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

export interface DirEntry {
  name: string
  path: string
}

export interface BrowseResult {
  path: string
  /** True when `path` is the synthetic volume listing rather than a folder. */
  isRoot: boolean
  /** Parent path, or null at the top (volume list / filesystem root). */
  parent: string | null
  dirs: DirEntry[]
}

/**
 * Enumerate Windows drive letters by probing the filesystem directly (A–Z).
 *
 * This needs no external process: in a packaged Electron/DSH environment the
 * `PATH` may be trimmed so `powershell.exe`/`wmic` cannot spawn (which used to
 * silently degrade to only `C:\`), and `wmic` is removed on newer Windows.
 * Probing `X:\` is fast, deterministic and only reports drives this process
 * can actually access.
 */
async function listWindowsVolumes(): Promise<string[]> {
  const checks: Promise<string | null>[] = []
  for (let code = 65; code <= 90; code += 1) {
    const root = `${String.fromCharCode(code)}:\\`
    checks.push(
      access(root)
        .then(() => root)
        .catch(() => null),
    )
  }
  return (await Promise.all(checks)).filter((v): v is string => v !== null)
}

/** Volume roots on Windows, or the single filesystem root on POSIX. */
export async function listVolumes(): Promise<string[]> {
  if (process.platform === 'win32') return listWindowsVolumes()
  return ['/']
}

/** Convenience locations shown as quick-entry shortcuts. */
export function quickPlaces(): { name: string; path: string }[] {
  const home = os.homedir()
  const places = [
    { name: '主目录', path: home },
    { name: '桌面', path: path.join(home, 'Desktop') },
    { name: '下载', path: path.join(home, 'Downloads') },
    { name: '文档', path: path.join(home, 'Documents') },
  ]
  if (process.platform === 'win32') {
    places.push({ name: 'ProgramData', path: process.env.ProgramData ?? 'C:\\ProgramData' })
  }
  return places
}

/** List the immediate subfolders of a directory (single readdir, folders only). */
export async function listDirectories(target: string): Promise<BrowseResult> {
  const resolved = path.resolve(target)
  let entries: import('node:fs').Dirent[] = []
  try {
    entries = await readdir(resolved, { withFileTypes: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`无法读取目录「${resolved}」：${message}`)
  }

  const names = entries.filter((d) => d.isDirectory()).map((d) => d.name)
  names.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))

  const dirs: DirEntry[] = names
    .filter((name) => !name.startsWith('.'))
    .map((name) => ({ name, path: path.join(resolved, name) }))

  const atTop = process.platform === 'win32' ? /^[A-Za-z]:[\\/]$/.test(resolved) : resolved === '/'
  return {
    path: resolved,
    isRoot: false,
    parent: atTop ? null : path.dirname(resolved),
    dirs,
  }
}

/** Top-level listing: drives on Windows (synthetic root), folders of / on POSIX. */
export async function browseRoot(): Promise<BrowseResult> {
  if (process.platform !== 'win32') return listDirectories('/')
  const volumes = await listVolumes()
  return {
    path: '',
    isRoot: true,
    parent: null,
    dirs: volumes.map((v) => ({ name: v.replace(/[\\/]$/, ''), path: v })),
  }
}
