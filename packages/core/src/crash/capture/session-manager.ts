/**
 * In-process crash capture session registry (one active session per process).
 */
import {
  connectAdbTarget,
  listAdbDevices,
  startAndroidAdbCapture,
  type AndroidCaptureHandle,
} from './android-adb.js'
import {
  getIosCaptureSupport,
  listIosDevices,
  startIosMacosCapture,
  type IosCaptureHandle,
} from './ios-macos.js'
import { androidEmptyDeviceHint, detectWindowsUsbHint } from './windows-usb-hint.js'

export type CapturePlatform = 'android' | 'ios'

export interface CaptureSessionStatus {
  active: boolean
  platform?: CapturePlatform
  deviceId?: string
  repoPath?: string
  startedAt?: string
  hitCount: number
  lastHitId?: string
  lastError?: string
}

type ActiveHandle = AndroidCaptureHandle | IosCaptureHandle

let active: ActiveHandle | null = null
let hitCount = 0
let lastHitId: string | undefined
let lastError: string | undefined

function clearStats(): void {
  hitCount = 0
  lastHitId = undefined
  lastError = undefined
}

export function getCaptureSessionStatus(): CaptureSessionStatus {
  if (!active) {
    return { active: false, hitCount, lastHitId, lastError }
  }
  const deviceId =
    active.platform === 'android'
      ? active.serial
      : active.udid
  return {
    active: true,
    platform: active.platform,
    deviceId,
    repoPath: active.repoPath,
    startedAt: active.startedAt,
    hitCount,
    lastHitId,
    lastError,
  }
}

export async function listCaptureDevices(platform: CapturePlatform): Promise<{
  ok: boolean
  platform: CapturePlatform
  devices: Array<{ id: string; label: string; state?: string }>
  error?: string
  adbPath?: string
  adbDownloaded?: boolean
  adbManaged?: boolean
  iosSupport?: Awaited<ReturnType<typeof getIosCaptureSupport>>
}> {
  if (platform === 'android') {
    const listed = await listAdbDevices()
    const online = listed.devices.filter((d) => d.state === 'device')
    const pending = listed.devices.filter((d) => d.state !== 'device')
    let error = listed.error
    if (listed.ok && !online.length) {
      if (pending.some((d) => d.state === 'unauthorized')) {
        error =
          '手机已连接但未授权：请解锁手机并点允许 USB 调试'
      } else if (pending.length) {
        error = `adb 看到设备但状态异常：${pending.map((d) => `${d.serial}:${d.state}`).join(', ')}`
      } else {
        const usb = await detectWindowsUsbHint()
        error = androidEmptyDeviceHint(usb)
      }
    }
    return {
      ok: listed.ok,
      platform,
      devices: online.map((d) => ({
        id: d.serial,
        label: d.model ? `${d.serial} (${d.model})` : d.serial,
        state: d.state,
      })),
      error,
      adbPath: listed.adbPath,
      adbDownloaded: listed.adbDownloaded,
      adbManaged: listed.adbManaged,
    }
  }
  const listed = await listIosDevices()
  return {
    ok: listed.ok,
    platform,
    devices: listed.devices.map((d) => ({
      id: d.udid,
      label: d.name ? `${d.udid} (${d.name})` : d.udid,
    })),
    error: listed.error,
    iosSupport: listed.support,
  }
}

/** Wireless / TCP adb connect, then caller should refresh device list. */
export async function connectCaptureAdbTarget(target: string, cacheRoot?: string) {
  return connectAdbTarget(target, { cacheRoot })
}

export async function startCaptureSession(options: {
  platform: CapturePlatform
  repoPath: string
  deviceId?: string
  cacheRoot?: string
  deviceModel?: string
}): Promise<CaptureSessionStatus> {
  if (active) {
    throw new Error('A capture session is already running — stop it before starting another')
  }
  clearStats()
  const onHit = (id: string) => {
    hitCount += 1
    lastHitId = id
  }
  try {
    if (options.platform === 'android') {
      const serial = options.deviceId?.trim()
      if (!serial) throw new Error('Select an Android device serial')
      active = await startAndroidAdbCapture({
        repoPath: options.repoPath,
        serial,
        cacheRoot: options.cacheRoot,
        deviceModel: options.deviceModel,
        onHit,
      })
    } else {
      active = await startIosMacosCapture({
        repoPath: options.repoPath,
        udid: options.deviceId,
        cacheRoot: options.cacheRoot,
        deviceModel: options.deviceModel,
        onHit,
        onError: (message) => {
          lastError = message
        },
      })
    }
  } catch (err) {
    active = null
    lastError = err instanceof Error ? err.message : String(err)
    throw err
  }
  return getCaptureSessionStatus()
}

export async function stopCaptureSession(): Promise<CaptureSessionStatus> {
  const handle = active
  active = null
  if (handle) {
    try {
      await handle.stop()
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
    }
  }
  return getCaptureSessionStatus()
}
