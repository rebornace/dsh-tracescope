/**
 * Android USB capture via adb logcat → local crash inbox.
 */
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { appendInboxIncident } from '../inbox-store.js'
import { ensureAdb, spawnAdb } from './ensure-adb.js'
import { extractAndroidLogcatHits } from './android-logcat-parse.js'

export interface AdbDevice {
  serial: string
  state: string
  model?: string
  product?: string
}

export interface AndroidCaptureHandle {
  platform: 'android'
  serial: string
  repoPath: string
  startedAt: string
  stop: () => Promise<void>
}

function parseAdbDevices(stdout: string): AdbDevice[] {
  const lines = stdout.split(/\r?\n/).slice(1)
  const devices: AdbDevice[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const parts = trimmed.split(/\s+/)
    const serial = parts[0]
    const state = parts[1]
    if (!serial || !state) continue
    const model = trimmed.match(/\bmodel:(\S+)/)?.[1]
    const product = trimmed.match(/\bproduct:(\S+)/)?.[1]
    devices.push({ serial, state, model, product })
  }
  return devices
}

async function runAdb(
  adbPath: string,
  args: string[],
  timeoutMs = 15_000,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    let settled = false
    const child = spawnAdb(adbPath, args)
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
      resolve({ code: -1, stdout, stderr: stderr || 'adb timed out' })
    }, timeoutMs)
    child.stdout?.on('data', (buf: Buffer) => {
      stdout += buf.toString('utf8')
    })
    child.stderr?.on('data', (buf: Buffer) => {
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

/** List adb devices; auto-installs platform-tools when adb is missing. */
export async function listAdbDevices(options?: {
  cacheRoot?: string
}): Promise<{
  ok: boolean
  devices: AdbDevice[]
  error?: string
  adbPath?: string
  adbDownloaded?: boolean
  adbManaged?: boolean
}> {
  const ensured = await ensureAdb({ cacheRoot: options?.cacheRoot })
  if (!ensured.ok || !ensured.adbPath) {
    return {
      ok: false,
      devices: [],
      error:
        ensured.error ||
        'adb not available — TraceScope could not download Android platform-tools',
    }
  }
  const result = await runAdb(ensured.adbPath, ['devices', '-l'])
  if (result.code === -1 && /timed out/i.test(result.stderr)) {
    return {
      ok: false,
      devices: [],
      error: result.stderr,
      adbPath: ensured.adbPath,
      adbDownloaded: ensured.downloaded,
      adbManaged: ensured.managedInstall,
    }
  }
  if (result.code !== 0 && !result.stdout.includes('List of devices')) {
    return {
      ok: false,
      devices: [],
      error: result.stderr.trim() || result.stdout.trim() || `adb exited ${result.code}`,
      adbPath: ensured.adbPath,
      adbDownloaded: ensured.downloaded,
      adbManaged: ensured.managedInstall,
    }
  }
  return {
    ok: true,
    devices: parseAdbDevices(result.stdout),
    adbPath: ensured.adbPath,
    adbDownloaded: ensured.downloaded,
    adbManaged: ensured.managedInstall,
  }
}

/**
 * Connect to a device over TCP (wireless debugging / adb tcpip).
 * `target` examples: `192.168.1.8:5555`, `192.168.1.8:37123`
 */
export async function connectAdbTarget(
  target: string,
  options?: { cacheRoot?: string },
): Promise<{ ok: boolean; message: string; adbPath?: string }> {
  const address = target.trim().replace(/^adb\s+connect\s+/i, '')
  if (!/^.+:\d{2,5}$/.test(address)) {
    return { ok: false, message: '请填写 host:端口，例如 192.168.1.8:5555' }
  }
  const ensured = await ensureAdb({ cacheRoot: options?.cacheRoot })
  if (!ensured.ok || !ensured.adbPath) {
    return { ok: false, message: ensured.error || 'adb 不可用' }
  }
  const result = await runAdb(ensured.adbPath, ['connect', address], 20_000)
  const out = `${result.stdout}\n${result.stderr}`.trim()
  const ok = /connected to|already connected/i.test(out)
  return {
    ok,
    message: out || (ok ? `已连接 ${address}` : `连接失败：${address}`),
    adbPath: ensured.adbPath,
  }
}

export interface StartAndroidCaptureOptions {
  repoPath: string
  serial: string
  cacheRoot?: string
  deviceModel?: string
  /** Injected for tests. */
  spawnLogcat?: (serial: string) => ChildProcessWithoutNullStreams
  onHit?: (incidentId: string) => void
}

/**
 * Start streaming logcat for one device; crashes/ANRs are appended to the inbox.
 */
export async function startAndroidAdbCapture(
  options: StartAndroidCaptureOptions,
): Promise<AndroidCaptureHandle> {
  const serial = options.serial.trim()
  const repoPath = options.repoPath.trim()
  if (!serial) throw new Error('Android capture requires device serial')
  if (!repoPath) throw new Error('Android capture requires repoPath')

  const ensured = await ensureAdb({ cacheRoot: options.cacheRoot })
  if (!ensured.ok || !ensured.adbPath) {
    throw new Error(ensured.error || 'adb not available')
  }
  const adbPath = ensured.adbPath

  // Clear so we only see new events during this session (best-effort).
  await runAdb(adbPath, ['-s', serial, 'logcat', '-c'], 10_000)

  const child =
    options.spawnLogcat?.(serial) ??
    spawnAdb(adbPath, ['-s', serial, 'logcat', '-v', 'threadtime'])

  let buffer = ''
  let stopping = false
  const seenTitles = new Set<string>()

  const flush = async (force = false) => {
    if (!buffer.trim()) return
    // Keep a trailing window so multi-line blocks spanning chunks still parse.
    const window = buffer.length > 64_000 ? buffer.slice(-64_000) : buffer
    const hits = extractAndroidLogcatHits(window)
    for (const hit of hits) {
      const dedupeKey = `${hit.kind}:${hit.title}`
      if (seenTitles.has(dedupeKey)) continue
      seenTitles.add(dedupeKey)
      const entry = await appendInboxIncident(
        repoPath,
        {
          stackText: hit.stackText,
          title: hit.title,
          exceptionName: hit.exceptionName,
          platform: 'android',
          errorKind: hit.kind,
          deviceModel: options.deviceModel,
        },
        { source: 'android-adb', cacheRoot: options.cacheRoot },
      )
      if (entry && options.onHit) options.onHit(entry.incident.id)
    }
    if (force) buffer = ''
    else if (buffer.length > 96_000) buffer = buffer.slice(-48_000)
  }

  child.stdout?.setEncoding('utf8')
  child.stdout?.on('data', (chunk: string) => {
    buffer += chunk
    if (buffer.length > 8_000 || chunk.includes('FATAL EXCEPTION') || /\bANR in\b/i.test(chunk)) {
      void flush()
    }
  })
  child.stderr?.setEncoding('utf8')
  child.on('error', () => {
    /* stop() / status surfaces absence */
  })

  const startedAt = new Date().toISOString()
  return {
    platform: 'android',
    serial,
    repoPath,
    startedAt,
    stop: async () => {
      if (stopping) return
      stopping = true
      await flush(true)
      try {
        child.kill('SIGTERM')
      } catch {
        /* ignore */
      }
    },
  }
}
