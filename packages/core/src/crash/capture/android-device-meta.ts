/**
 * Android device / package metadata via adb getprop + dumpsys (best-effort).
 */
import { spawnAdb } from './ensure-adb.js'

export interface AndroidDeviceMeta {
  id: string
  model?: string
  product?: string
  manufacturer?: string
  osVersion?: string
  /** `ro.build.display.id` / `ro.build.id` — OS image id, not the app. */
  osBuildId?: string
  abi?: string
}

export interface AndroidPackageVersion {
  packageName: string
  appVersion?: string
  buildNumber?: string
  /** Prefer versionCode for binary correlation. */
  buildId?: string
}

async function runAdb(
  adbPath: string,
  args: string[],
  timeoutMs = 12_000,
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

async function getprop(
  adbPath: string,
  serial: string,
  key: string,
): Promise<string | undefined> {
  const result = await runAdb(adbPath, ['-s', serial, 'shell', 'getprop', key], 8_000)
  const value = result.stdout.trim()
  if (result.code !== 0 || !value) return undefined
  return value
}

/** Collect stable device props once per capture session. */
export async function fetchAndroidDeviceMeta(
  adbPath: string,
  serial: string,
): Promise<AndroidDeviceMeta> {
  const id = serial.trim()
  const [model, product, manufacturer, osVersion, osBuildDisplay, osBuildId, abi] =
    await Promise.all([
      getprop(adbPath, id, 'ro.product.model'),
      getprop(adbPath, id, 'ro.product.name'),
      getprop(adbPath, id, 'ro.product.manufacturer'),
      getprop(adbPath, id, 'ro.build.version.release'),
      getprop(adbPath, id, 'ro.build.display.id'),
      getprop(adbPath, id, 'ro.build.id'),
      getprop(adbPath, id, 'ro.product.cpu.abi'),
    ])
  return {
    id,
    model: model || undefined,
    product: product || undefined,
    manufacturer: manufacturer || undefined,
    osVersion: osVersion || undefined,
    osBuildId: osBuildDisplay || osBuildId || undefined,
    abi: abi || undefined,
  }
}

const PROCESS_RE = /\bProcess:\s*([^\s,]+)/i
const ANR_PROCESS_RE = /\bANR in\s+([^\s(]+)/i

/** Extract Android process / package name from a logcat crash/ANR block. */
export function extractAndroidProcessName(stackText: string): string | undefined {
  const process = stackText.match(PROCESS_RE)?.[1]?.trim()
  if (process) return process
  const anr = stackText.match(ANR_PROCESS_RE)?.[1]?.trim()
  return anr || undefined
}

/**
 * Best-effort package version from `dumpsys package`.
 * Cached by the caller — dumpsys can be slow on some devices.
 */
export async function fetchAndroidPackageVersion(
  adbPath: string,
  serial: string,
  packageName: string,
): Promise<AndroidPackageVersion | null> {
  const pkg = packageName.trim()
  if (!pkg || pkg.includes(' ')) return null
  const result = await runAdb(
    adbPath,
    ['-s', serial, 'shell', 'dumpsys', 'package', pkg],
    15_000,
  )
  if (result.code !== 0 && !result.stdout.trim()) return null
  const text = result.stdout
  const versionName = text.match(/\bversionName=(\S+)/)?.[1]?.replace(/['"]/g, '')
  const versionCode = text.match(/\bversionCode=(\d+)/)?.[1]
  if (!versionName && !versionCode) return null
  return {
    packageName: pkg,
    appVersion: versionName || undefined,
    buildNumber: versionCode || undefined,
    buildId: versionCode || versionName || undefined,
  }
}
