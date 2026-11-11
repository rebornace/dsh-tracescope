/**
 * Resolve or auto-install Android platform-tools (adb) under TraceScope data root.
 * Users should not need a manual SDK / PATH setup for inbox USB capture.
 */
import { execFile, spawn } from 'node:child_process'
import { access, chmod, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { dataRootSync } from '../../paths.js'
import { formatProxyHint, proxyAwareFetch } from '../proxy-fetch.js'

const execFileAsync = promisify(execFile)

export type EnsureAdbResult = {
  ok: boolean
  adbPath?: string
  /** true when TraceScope downloaded platform-tools this call (or previously into cache). */
  managedInstall?: boolean
  downloaded?: boolean
  error?: string
}

export type AdbPrepPhase =
  | 'idle'
  | 'checking'
  | 'downloading'
  | 'extracting'
  | 'ready'
  | 'error'

export type AdbPrepProgress = {
  phase: AdbPrepPhase
  /** 0–100 when known; omit/null while indeterminate. */
  percent: number | null
  message: string
  detail?: string
  adbPath?: string
  error?: string
  updatedAt: string
}

let ensureInFlight: Promise<EnsureAdbResult> | null = null
let cachedAdbPath: string | undefined
let prepProgress: AdbPrepProgress = {
  phase: 'idle',
  percent: null,
  message: '',
  updatedAt: new Date().toISOString(),
}

function setProgress(
  patch: Partial<Omit<AdbPrepProgress, 'updatedAt'>> & Pick<AdbPrepProgress, 'phase' | 'message'>,
): void {
  prepProgress = {
    ...prepProgress,
    ...patch,
    percent: patch.percent !== undefined ? patch.percent : prepProgress.percent,
    updatedAt: new Date().toISOString(),
  }
}

export function getAdbPrepProgress(): AdbPrepProgress {
  return { ...prepProgress }
}

function adbFileName(): string {
  return process.platform === 'win32' ? 'adb.exe' : 'adb'
}

function platformToolsZipName(): string {
  if (process.platform === 'win32') return 'platform-tools-latest-windows.zip'
  if (process.platform === 'darwin') return 'platform-tools-latest-darwin.zip'
  return 'platform-tools-latest-linux.zip'
}

/** Official + China-friendly mirrors (tried in order). */
export function platformToolsDownloadUrls(): string[] {
  const file = platformToolsZipName()
  return [
    `https://dl.google.com/android/repository/${file}`,
    `https://mirrors.cloud.tencent.com/AndroidSDK/${file}`,
    `https://mirrors.aliyun.com/android/repository/${file}`,
  ]
}

function managedPlatformToolsDir(cacheRoot?: string): string {
  return path.join(dataRootSync(cacheRoot), 'tools', 'platform-tools')
}

function managedAdbPath(cacheRoot?: string): string {
  return path.join(managedPlatformToolsDir(cacheRoot), adbFileName())
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

async function probeAdb(adbPath: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync(adbPath, ['version'], {
      timeout: 8_000,
      windowsHide: true,
    })
    return /Android Debug Bridge/i.test(stdout)
  } catch {
    return false
  }
}

async function whichOnPath(): Promise<string | undefined> {
  const cmd = process.platform === 'win32' ? 'where' : 'which'
  try {
    const { stdout } = await execFileAsync(cmd, ['adb'], {
      timeout: 5_000,
      windowsHide: true,
    })
    const first = stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find(Boolean)
    if (first && (await probeAdb(first))) return first
  } catch {
    /* not on PATH */
  }
  return undefined
}

function candidateAdbPaths(cacheRoot?: string): string[] {
  const name = adbFileName()
  const out: string[] = [managedAdbPath(cacheRoot)]
  const sdkRoots = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    process.env.ANDROID_SDK,
    path.join(homedir(), 'AppData', 'Local', 'Android', 'Sdk'),
    path.join(homedir(), 'Library', 'Android', 'sdk'),
    path.join(homedir(), 'Android', 'Sdk'),
    'C:\\Android\\Sdk',
    'C:\\Android',
  ].filter((v): v is string => Boolean(v && v.trim()))
  for (const root of sdkRoots) {
    out.push(path.join(root.trim(), 'platform-tools', name))
  }
  return out
}

async function findExistingAdb(cacheRoot?: string): Promise<{ path: string; managed: boolean } | null> {
  if (cachedAdbPath && (await probeAdb(cachedAdbPath))) {
    return { path: cachedAdbPath, managed: cachedAdbPath === managedAdbPath(cacheRoot) }
  }
  const onPath = await whichOnPath()
  if (onPath) {
    cachedAdbPath = onPath
    return { path: onPath, managed: false }
  }
  for (const candidate of candidateAdbPaths(cacheRoot)) {
    if (!(await fileExists(candidate))) continue
    if (await probeAdb(candidate)) {
      cachedAdbPath = candidate
      return { path: candidate, managed: candidate === managedAdbPath(cacheRoot) }
    }
  }
  return null
}

async function readResponseBuffer(
  res: Response,
  onBytes?: (received: number, total: number | null) => void,
): Promise<Buffer> {
  const totalHeader = res.headers.get('content-length')
  const total = totalHeader ? Number(totalHeader) : NaN
  const knownTotal = Number.isFinite(total) && total > 0 ? total : null
  if (!res.body || typeof res.body.getReader !== 'function') {
    const ab = await res.arrayBuffer()
    onBytes?.(ab.byteLength, knownTotal ?? ab.byteLength)
    return Buffer.from(ab)
  }
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      chunks.push(value)
      received += value.byteLength
      onBytes?.(received, knownTotal)
    }
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c)))
}

async function downloadZip(urls: string[]): Promise<{ buffer: Buffer; url: string }> {
  let lastError = ''
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i]!
    const mirrorLabel = `${i + 1}/${urls.length}`
    setProgress({
      phase: 'downloading',
      percent: 0,
      message: `正在下载 Android 采集工具（源 ${mirrorLabel}）…`,
      detail: url,
    })
    try {
      const res = await proxyAwareFetch(url, { redirect: 'follow' })
      if (!res.ok) {
        lastError = `${url} → HTTP ${res.status}`
        setProgress({
          phase: 'downloading',
          percent: 0,
          message: `源 ${mirrorLabel} 失败，尝试下一个…`,
          detail: lastError,
        })
        continue
      }
      const buffer = await readResponseBuffer(res, (received, total) => {
        const percent =
          total && total > 0 ? Math.min(99, Math.round((received / total) * 100)) : null
        const sizeMb = (received / (1024 * 1024)).toFixed(1)
        setProgress({
          phase: 'downloading',
          percent,
          message:
            percent != null
              ? `正在下载 Android 采集工具… ${percent}%`
              : `正在下载 Android 采集工具… ${sizeMb} MB`,
          detail: url,
        })
      })
      if (buffer.byteLength < 1_000_000) {
        lastError = `${url} → unexpected small payload (${buffer.byteLength} bytes)`
        continue
      }
      setProgress({
        phase: 'downloading',
        percent: 100,
        message: '下载完成，准备解压…',
        detail: url,
      })
      return { buffer, url }
    } catch (err) {
      lastError = `${url} → ${err instanceof Error ? err.message : String(err)}`
      setProgress({
        phase: 'downloading',
        percent: 0,
        message: `源 ${mirrorLabel} 失败，尝试下一个…`,
        detail: lastError,
      })
    }
  }
  throw new Error(
    `自动下载 Android 采集工具失败。${lastError}。${formatProxyHint()}。也可改用「已有堆栈？直接分析」。`,
  )
}

async function extractZip(zipPath: string, destParent: string): Promise<void> {
  await mkdir(destParent, { recursive: true })
  // Windows 10+ / macOS / Linux commonly ship bsdtar that can extract zip.
  await execFileAsync('tar', ['-xf', zipPath, '-C', destParent], {
    timeout: 120_000,
    windowsHide: true,
  })
}

async function downloadAndInstall(cacheRoot?: string): Promise<string> {
  const toolsRoot = path.join(dataRootSync(cacheRoot), 'tools')
  await mkdir(toolsRoot, { recursive: true })
  const staging = await mkdtemp(path.join(tmpdir(), 'ts-platform-tools-'))
  try {
    const { buffer } = await downloadZip(platformToolsDownloadUrls())
    setProgress({
      phase: 'extracting',
      percent: null,
      message: '正在解压 platform-tools…',
    })
    const zipPath = path.join(staging, 'platform-tools.zip')
    await writeFile(zipPath, buffer)
    await extractZip(zipPath, staging)
    const extracted = path.join(staging, 'platform-tools')
    const adbInExtracted = path.join(extracted, adbFileName())
    if (!(await fileExists(adbInExtracted))) {
      throw new Error('Downloaded zip did not contain platform-tools/adb')
    }
    const target = managedPlatformToolsDir(cacheRoot)
    await rm(target, { recursive: true, force: true })
    await mkdir(path.dirname(target), { recursive: true })
    await rename(extracted, target)
    if (process.platform !== 'win32') {
      try {
        await chmod(path.join(target, adbFileName()), 0o755)
      } catch {
        /* ignore */
      }
    }
    const adbPath = managedAdbPath(cacheRoot)
    if (!(await probeAdb(adbPath))) {
      throw new Error('Installed adb failed version probe')
    }
    cachedAdbPath = adbPath
    return adbPath
  } finally {
    await rm(staging, { recursive: true, force: true }).catch(() => undefined)
  }
}

/**
 * Ensure an adb binary is available. Downloads platform-tools into
 * `~/.tracescope/tools/platform-tools` when nothing usable is found.
 */
export async function ensureAdb(options?: {
  cacheRoot?: string
  /** When false, only look up existing adb (default true). */
  download?: boolean
}): Promise<EnsureAdbResult> {
  const download = options?.download !== false
  const cacheRoot = options?.cacheRoot

  if (ensureInFlight) return ensureInFlight

  ensureInFlight = (async () => {
    try {
      setProgress({
        phase: 'checking',
        percent: null,
        message: '正在检查本机 Android 采集工具…',
      })
      const existing = await findExistingAdb(cacheRoot)
      if (existing) {
        setProgress({
          phase: 'ready',
          percent: 100,
          message: existing.managed ? '已使用 TraceScope 缓存的 adb' : '已检测到系统 adb',
          adbPath: existing.path,
          error: undefined,
        })
        return {
          ok: true,
          adbPath: existing.path,
          managedInstall: existing.managed,
          downloaded: false,
        }
      }
      if (!download) {
        const error = '未找到 adb，且未启用自动下载'
        setProgress({ phase: 'error', percent: null, message: error, error })
        return { ok: false, error }
      }
      const adbPath = await downloadAndInstall(cacheRoot)
      setProgress({
        phase: 'ready',
        percent: 100,
        message: 'Android 采集工具已就绪',
        adbPath,
        error: undefined,
      })
      return { ok: true, adbPath, managedInstall: true, downloaded: true }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      setProgress({ phase: 'error', percent: null, message: error, error })
      return { ok: false, error }
    } finally {
      ensureInFlight = null
    }
  })()

  return ensureInFlight
}

/** Clear in-memory adb path cache (tests). */
export function clearEnsureAdbCacheForTests(): void {
  cachedAdbPath = undefined
  ensureInFlight = null
  prepProgress = {
    phase: 'idle',
    percent: null,
    message: '',
    updatedAt: new Date().toISOString(),
  }
}

/** Spawn helper that prefers a resolved adb path. */
export function spawnAdb(
  adbPath: string,
  args: string[],
  options?: { windowsHide?: boolean },
): ReturnType<typeof spawn> {
  return spawn(adbPath, args, { windowsHide: options?.windowsHide ?? true })
}
