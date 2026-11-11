/**
 * Resolve / probe iOS USB capture tools (libimobiledevice) — detect only, never install.
 */
import { spawn } from 'node:child_process'

export type IosPrepPhase = 'idle' | 'checking' | 'ready' | 'error'
export type IosPrepReasonCode = 'not_darwin' | 'missing_tools' | 'broken_tools'

export type IosPrepProgress = {
  phase: IosPrepPhase
  percent: number | null
  message: string
  detail?: string
  error?: string
  installCommand?: string
  reasonCode?: IosPrepReasonCode
  updatedAt: string
}

export type EnsureIosResult = {
  ok: boolean
  reasonCode?: IosPrepReasonCode
  installCommand?: string
  error?: string
  hasIdeviceId?: boolean
  hasIdeviceCrashReport?: boolean
}

export type EnsureIosDeps = {
  platform?: NodeJS.Platform
  commandExists: (cmd: string) => Promise<boolean>
  runCmd: (
    command: string,
    args: string[],
    timeoutMs?: number,
  ) => Promise<{ code: number; stdout: string; stderr: string }>
}

const INSTALL_MISSING = 'brew install libimobiledevice'
const INSTALL_BROKEN = 'brew reinstall libimobiledevice'

let ensureInFlight: Promise<EnsureIosResult> | null = null
let cachedOk = false
let prepProgress: IosPrepProgress = {
  phase: 'idle',
  percent: null,
  message: '',
  updatedAt: new Date().toISOString(),
}

function setProgress(
  patch: Partial<Omit<IosPrepProgress, 'updatedAt'>> &
    Pick<IosPrepProgress, 'phase' | 'message'>,
): void {
  prepProgress = {
    ...prepProgress,
    ...patch,
    percent: patch.percent !== undefined ? patch.percent : prepProgress.percent,
    updatedAt: new Date().toISOString(),
  }
}

export function getIosPrepProgress(): IosPrepProgress {
  return { ...prepProgress }
}

export function clearEnsureIosCacheForTests(): void {
  cachedOk = false
  ensureInFlight = null
  prepProgress = {
    phase: 'idle',
    percent: null,
    message: '',
    updatedAt: new Date().toISOString(),
  }
}

async function defaultRunCmd(
  command: string,
  args: string[],
  timeoutMs = 12_000,
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

async function defaultCommandExists(command: string): Promise<boolean> {
  const probe =
    process.platform === 'win32'
      ? await defaultRunCmd('where', [command])
      : await defaultRunCmd('which', [command])
  return probe.code === 0 && Boolean(probe.stdout.trim())
}

function looksLikeToolBroken(result: { code: number; stdout: string; stderr: string }): boolean {
  const err = `${result.stderr}\n${result.stdout}`
  if (/Library not loaded|dyld|image not found|cannot open shared object/i.test(err)) return true
  if (result.code === -1 && /timed out/i.test(result.stderr)) return true
  if (result.code !== 0 && /Library not loaded|dyld/i.test(err)) return true
  return false
}

function resolveDeps(deps?: EnsureIosDeps): Required<Pick<EnsureIosDeps, 'platform'>> & EnsureIosDeps {
  return {
    platform: deps?.platform ?? process.platform,
    commandExists: deps?.commandExists ?? defaultCommandExists,
    runCmd: deps?.runCmd ?? defaultRunCmd,
  }
}

export async function ensureIosTools(options?: {
  force?: boolean
  deps?: EnsureIosDeps
}): Promise<EnsureIosResult> {
  const d = resolveDeps(options?.deps)
  if (!options?.force && cachedOk && prepProgress.phase === 'ready') {
    return { ok: true, hasIdeviceId: true, hasIdeviceCrashReport: true }
  }
  if (!options?.force && ensureInFlight) return ensureInFlight

  ensureInFlight = (async () => {
    setProgress({
      phase: 'checking',
      percent: null,
      message: 'Checking iOS capture tools…',
      installCommand: undefined,
      reasonCode: undefined,
      error: undefined,
    })

    if (d.platform !== 'darwin') {
      const result: EnsureIosResult = {
        ok: false,
        reasonCode: 'not_darwin',
        error:
          'iOS USB capture is available only on macOS. On Windows you can still browse the inbox and import .crash files.',
      }
      setProgress({
        phase: 'error',
        percent: null,
        message: result.error!,
        error: result.error,
        reasonCode: 'not_darwin',
        installCommand: undefined,
      })
      cachedOk = false
      return result
    }

    const hasIdeviceId = await d.commandExists('idevice_id')
    const hasIdeviceCrashReport = await d.commandExists('idevicecrashreport')
    if (!hasIdeviceId || !hasIdeviceCrashReport) {
      const result: EnsureIosResult = {
        ok: false,
        reasonCode: 'missing_tools',
        installCommand: INSTALL_MISSING,
        hasIdeviceId,
        hasIdeviceCrashReport,
        error:
          'idevicecrashreport not found — install libimobiledevice (e.g. brew install libimobiledevice)',
      }
      setProgress({
        phase: 'error',
        percent: null,
        message: result.error!,
        error: result.error,
        reasonCode: 'missing_tools',
        installCommand: INSTALL_MISSING,
      })
      cachedOk = false
      return result
    }

    const idProbe = await d.runCmd('idevice_id', ['-l'], 12_000)
    const idLaunchBroken = looksLikeToolBroken(idProbe) || idProbe.code === -1

    if (idLaunchBroken) {
      const detail = idProbe.stderr.trim() || idProbe.stdout.trim() || 'idevice_id failed'
      const result: EnsureIosResult = {
        ok: false,
        reasonCode: 'broken_tools',
        installCommand: INSTALL_BROKEN,
        hasIdeviceId,
        hasIdeviceCrashReport,
        error: `iOS tools found but failed to run: ${detail}`,
      }
      setProgress({
        phase: 'error',
        percent: null,
        message: result.error!,
        error: result.error,
        detail,
        reasonCode: 'broken_tools',
        installCommand: INSTALL_BROKEN,
      })
      cachedOk = false
      return result
    }

    const crashProbe = await d.runCmd('idevicecrashreport', ['--help'], 12_000)
    const crashOut = `${crashProbe.stdout}\n${crashProbe.stderr}`
    const crashLaunchBroken =
      crashProbe.code === -1 || /Library not loaded|dyld|image not found/i.test(crashOut)
    const crashLooksRunnable =
      !crashLaunchBroken &&
      (crashProbe.code === 0 || /usage|idevicecrashreport/i.test(crashOut))

    if (!crashLooksRunnable) {
      const detail = crashProbe.stderr.trim() || crashProbe.stdout.trim() || 'idevicecrashreport failed'
      const result: EnsureIosResult = {
        ok: false,
        reasonCode: 'broken_tools',
        installCommand: INSTALL_BROKEN,
        hasIdeviceId,
        hasIdeviceCrashReport,
        error: `iOS tools found but failed to run: ${detail}`,
      }
      setProgress({
        phase: 'error',
        percent: null,
        message: result.error!,
        error: result.error,
        detail,
        reasonCode: 'broken_tools',
        installCommand: INSTALL_BROKEN,
      })
      cachedOk = false
      return result
    }

    const result: EnsureIosResult = {
      ok: true,
      hasIdeviceId: true,
      hasIdeviceCrashReport: true,
    }
    setProgress({
      phase: 'ready',
      percent: 100,
      message: 'iOS capture tools ready',
      reasonCode: undefined,
      installCommand: undefined,
      error: undefined,
    })
    cachedOk = true
    return result
  })().finally(() => {
    ensureInFlight = null
  })

  return ensureInFlight
}
