/**
 * iOS USB crash capture — macOS only (libimobiledevice idevicecrashreport).
 */
import { spawn } from 'node:child_process'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { appendInboxIncident } from '../inbox-store.js'

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

function isDarwin(): boolean {
  return process.platform === 'darwin'
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

async function commandExists(command: string): Promise<boolean> {
  const probe = process.platform === 'win32' ? await runCmd('where', [command]) : await runCmd('which', [command])
  return probe.code === 0 && Boolean(probe.stdout.trim())
}

export async function getIosCaptureSupport(): Promise<IosCaptureSupport> {
  if (!isDarwin()) {
    return {
      supported: false,
      reason:
        'iOS USB capture is available only on macOS. On Windows you can still browse the inbox and import .crash files.',
    }
  }
  const hasIdeviceCrashReport = await commandExists('idevicecrashreport')
  const hasIdeviceId = await commandExists('idevice_id')
  if (!hasIdeviceCrashReport) {
    return {
      supported: false,
      hasIdeviceCrashReport,
      hasIdeviceId,
      reason:
        'idevicecrashreport not found — install libimobiledevice (e.g. brew install libimobiledevice)',
    }
  }
  return { supported: true, hasIdeviceCrashReport, hasIdeviceId }
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
  const exc = text.match(/Exception Type:\s*([^\r\n]+)/i)?.[1]?.trim()
  if (exc) return exc.slice(0, 200)
  const name = text.match(/Exception Subtype:\s*([^\r\n]+)/i)?.[1]?.trim()
  if (name) return name.slice(0, 200)
  return fileName.replace(/\.ips$/i, '').replace(/\.crash$/i, '').slice(0, 200) || 'iOS crash'
}

async function ingestCrashDir(
  repoPath: string,
  dir: string,
  options: { cacheRoot?: string; deviceModel?: string; seenFiles: Set<string> },
): Promise<string[]> {
  const ids: string[] = []
  let names: string[]
  try {
    names = await readdir(dir)
  } catch {
    return ids
  }
  for (const name of names) {
    if (!/\.(crash|ips|panic)$/i.test(name)) continue
    const full = path.join(dir, name)
    if (options.seenFiles.has(full)) continue
    let text = ''
    try {
      text = await readFile(full, 'utf8')
    } catch {
      continue
    }
    if (!text.trim()) continue
    options.seenFiles.add(full)
    const entry = await appendInboxIncident(
      repoPath,
      {
        stackText: text,
        title: titleFromCrashText(text, name),
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
 * Poll idevicecrashreport into a temp dir and append new reports to the inbox.
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

  const pullOnce = async () => {
    if (stopping) return
    const args = ['-e', '-k', workDir]
    if (options.udid?.trim()) {
      args.unshift('-u', options.udid.trim())
    }
    await runCmd('idevicecrashreport', args, 60_000)
    const ids = await ingestCrashDir(repoPath, workDir, {
      cacheRoot: options.cacheRoot,
      deviceModel: options.deviceModel,
      seenFiles,
    })
    for (const id of ids) options.onHit?.(id)
  }

  await pullOnce()
  const pollMs = Math.max(5_000, options.pollMs ?? 15_000)
  timer = setInterval(() => {
    void pullOnce()
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
        await pullOnce()
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
