/**
 * Filesystem browsing helpers powering the visual folder picker.
 *
 * The sidebar webview cannot reliably open a native directory dialog, so the
 * panel renders its own picker and asks the host (which has full disk access)
 * to enumerate volumes and the subfolders of a given path.
 */
import { execFile } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

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

async function listWindowsVolumes(): Promise<string[]> {
  // `wmic` is removed on newer Windows; prefer PowerShell, fall back to wmic.
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        "[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-PSDrive -PSProvider FileSystem | ForEach-Object { $_.Root }",
      ],
      { windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
    )
    const drives = stdout
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => /^[A-Za-z]:[\\/]/.test(s))
    if (drives.length) return drives.map((d) => d.toUpperCase())
  } catch {
    /* fall through to wmic */
  }
  try {
    const { stdout } = await execFileAsync('wmic', ['logicaldisk', 'get', 'name'], {
      windowsHide: true,
    })
    return stdout
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => /^[A-Za-z]:$/.test(s))
      .map((s) => s.toUpperCase() + '\\')
  } catch {
    return ['C:\\']
  }
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
