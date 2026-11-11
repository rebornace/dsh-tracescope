/**
 * iOS USB crash capture — macOS only (libimobiledevice idevicecrashreport).
 */
import { spawn } from 'node:child_process'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  appleIpsIdentity,
  parseAppleIpsText,
  titleFromAppleIps,
} from '../apple-ips.js'
import { appendInboxIncident } from '../inbox-store.js'
import { ensureIosTools, type EnsureIosDeps } from './ensure-ios.js'

export interface IosDevice {
  udid: string
  name?: string
}

export interface IosCaptureSupport {
  supported: boolean
  reason?: string
  hasIdeviceCrashReport?: boolean
  hasIdeviceId?: boolean
}

export interface IosCaptureHandle {
  platform: 'ios'
  udid?: string
  repoPath: string
  startedAt: string
  stop: () => Promise<void>
}

async function runCmd(
  command: string,
  args: string[],
  timeoutMs = 20_000,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    let settled = false
    const child = spawn(command, args, { windowsHide: true })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      try {
        child.kill('SIGTERM')
      } catch {
        /* ignore */
      }
      resolve({ code: -1, stdout, stderr: stderr || `${command} timed out` })
    }, timeoutMs)
    child.stdout.on('data', (buf: Buffer) => {
      stdout += buf.toString('utf8')
    })
    child.stderr.on('data', (buf: Buffer) => {
      stderr += buf.toString('utf8')
    })
    child.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ code: -1, stdout, stderr: err.message || String(err) })
    })
    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ code: code ?? 1, stdout, stderr })
    })
  })
}

export async function getIosCaptureSupport(options?: {
  force?: boolean
  deps?: EnsureIosDeps
}): Promise<IosCaptureSupport> {
  const ensured = await ensureIosTools({ force: options?.force, deps: options?.deps })
  if (!ensured.ok) {
    return {
      supported: false,
      reason: ensured.error,
      hasIdeviceCrashReport: ensured.hasIdeviceCrashReport,
      hasIdeviceId: ensured.hasIdeviceId,
    }
  }
  return {
    supported: true,
    hasIdeviceCrashReport: true,
    hasIdeviceId: true,
  }
}

/** List connected iOS devices (empty on non-macOS or when tools missing). */
export async function listIosDevices(): Promise<{
  ok: boolean
  devices: IosDevice[]
  support: IosCaptureSupport
  error?: string
}> {
  const support = await getIosCaptureSupport()
  if (!support.supported) {
    return { ok: false, devices: [], support, error: support.reason }
  }
  if (!support.hasIdeviceId) {
    return {
      ok: true,
      devices: [],
      support,
      error: undefined,
    }
  }
  const result = await runCmd('idevice_id', ['-l'])
  if (result.code !== 0) {
    return {
      ok: false,
      devices: [],
      support,
      error: result.stderr.trim() || result.stdout.trim() || 'idevice_id failed',
    }
  }
  const devices = result.stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((udid) => ({ udid }))
  return { ok: true, devices, support }
}

function titleFromCrashText(text: string, fileName: string): string {
  const ips = parseAppleIpsText(text)
  if (ips) return titleFromAppleIps(ips, fileName)
  const exc = text.match(/Exception Type:\s*([^\r\n]+)/i)?.[1]?.trim()
  if (exc) return exc.slice(0, 200)
  const name = text.match(/Exception Subtype:\s*([^\r\n]+)/i)?.[1]?.trim()
  if (name) return name.slice(0, 200)
  return fileName.replace(/\.ips$/i, '').replace(/\.crash$/i, '').slice(0, 200) || 'iOS crash'
}

function seenKeyForCrashFile(full: string, text: string): string {
  const base = path.basename(full)
  const ips = parseAppleIpsText(text)
  return appleIpsIdentity(ips, base)
}

async function listCrashFilesInDir(dir: string): Promise<string[]> {
  let names: string[]
  try {
    names = await readdir(dir)
  } catch {
    return []
  }
  return names
    .filter((name) => /\.(crash|ips|panic)$/i.test(name))
    .map((name) => path.join(dir, name))
}

/**
 * Mark crash files already present as seen without writing the inbox.
 * Used as a session baseline so historical device reports are not treated as
 * new hits (Android clears logcat for the same reason).
 */
export async function seedSeenCrashFiles(
  dir: string,
  seenFiles: Set<string>,
): Promise<number> {
  const files = await listCrashFilesInDir(dir)
  let n = 0
  for (const full of files) {
    let text = ''
    try {
      text = await readFile(full, 'utf8')
    } catch {
      continue
    }
    const key = seenKeyForCrashFile(full, text)
    if (seenFiles.has(key)) continue
    seenFiles.add(key)
    n += 1
  }
  return n
}

async function ingestCrashDir(
  repoPath: string,
  dir: string,
  options: { cacheRoot?: string; deviceModel?: string; seenFiles: Set<string> },
): Promise<string[]> {
  const ids: string[] = []
  const files = await listCrashFilesInDir(dir)
  for (const full of files) {
    let text = ''
    try {
      text = await readFile(full, 'utf8')
    } catch {
      continue
    }
    if (!text.trim()) continue
    const key = seenKeyForCrashFile(full, text)
    if (options.seenFiles.has(key)) continue
    options.seenFiles.add(key)
    const name = path.basename(full)
    const ips = parseAppleIpsText(text)
    const exceptionName = ips
      ? [ips.body.exception?.type, ips.body.exception?.signal].filter(Boolean).join(' / ') ||
        undefined
      : undefined
    const entry = await appendInboxIncident(
      repoPath,
      {
        stackText: text,
        title: titleFromCrashText(text, name),
        exceptionName,
        platform: 'ios',
        errorKind: 'crash',
        deviceModel: options.deviceModel,
        rawRef: name,
      },
      { source: 'ios-usb', cacheRoot: options.cacheRoot },
    )
    if (entry) ids.push(entry.incident.id)
  }
  return ids
}

export interface StartIosCaptureOptions {
  repoPath: string
  udid?: string
  cacheRoot?: string
  deviceModel?: string
  /** Poll interval for pulling crash reports (ms). */
  pollMs?: number
  onHit?: (incidentId: string) => void
}

/**
 * Poll idevicecrashreport into a temp dir and append **new** reports to the inbox.
 * The first pull only baselines existing device reports (no inbox write), matching
 * Android's logcat -c so starting capture does not dump historical crashes.
 */
export async function startIosMacosCapture(
  options: StartIosCaptureOptions,
): Promise<IosCaptureHandle> {
  const support = await getIosCaptureSupport()
  if (!support.supported) {
    throw new Error(support.reason || 'iOS capture not supported on this host')
  }
  const repoPath = options.repoPath.trim()
  if (!repoPath) throw new Error('iOS capture requires repoPath')

  const workDir = await mkdtemp(path.join(tmpdir(), 'ts-ios-crash-'))
  const seenFiles = new Set<string>()
  let stopping = false
  let timer: ReturnType<typeof setInterval> | null = null

  const pullDeviceReports = async () => {
    const args = ['-e', '-k', workDir]
    if (options.udid?.trim()) {
      args.unshift('-u', options.udid.trim())
    }
    await runCmd('idevicecrashreport', args, 60_000)
  }

  const pullOnce = async (mode: 'baseline' | 'ingest') => {
    await pullDeviceReports()
    if (mode === 'baseline') {
      await seedSeenCrashFiles(workDir, seenFiles)
      return
    }
    const ids = await ingestCrashDir(repoPath, workDir, {
      cacheRoot: options.cacheRoot,
      deviceModel: options.deviceModel,
      seenFiles,
    })
    for (const id of ids) options.onHit?.(id)
  }

  // Baseline historical reports first — do not count them as session hits.
  await pullOnce('baseline')
  // iOS crash reports can appear a few seconds after the process dies — poll often.
  const pollMs = Math.max(3_000, options.pollMs ?? 5_000)
  timer = setInterval(() => {
    if (stopping) return
    void pullOnce('ingest')
  }, pollMs)

  const startedAt = new Date().toISOString()
  return {
    platform: 'ios',
    udid: options.udid?.trim() || undefined,
    repoPath,
    startedAt,
    stop: async () => {
      if (stopping) return
      stopping = true
      if (timer) clearInterval(timer)
      timer = null
      try {
        await pullOnce('ingest')
      } catch {
        /* ignore */
      }
      try {
        await rm(workDir, { recursive: true, force: true })
      } catch {
        /* ignore */
      }
    },
  }
}
