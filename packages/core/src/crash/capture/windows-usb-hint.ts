/**
 * Best-effort Windows USB hints when adb sees no devices
 * (e.g. Huawei phone enumerated as HDB / HiSuite instead of ADB).
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export type WindowsUsbHint = {
  huaweiHdb: boolean
  huaweiPresent: boolean
  detail?: string
}

export async function detectWindowsUsbHint(): Promise<WindowsUsbHint | null> {
  if (process.platform !== 'win32') return null
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        "Get-PnpDevice -PresentOnly | Where-Object { $_.FriendlyName -match 'Huawei|HUAWEI|HDB|Android|Hisuite' } | ForEach-Object { $_.FriendlyName } | Out-String -Width 200",
      ],
      { timeout: 12_000, windowsHide: true, encoding: 'utf8' },
    )
    const text = String(stdout || '')
    const huaweiHdb = /HDB/i.test(text)
    const huaweiPresent = /Huawei|HUAWEI|Hisuite|HDB/i.test(text)
    if (!huaweiPresent && !/Android/i.test(text)) {
      return { huaweiHdb: false, huaweiPresent: false }
    }
    return {
      huaweiHdb,
      huaweiPresent,
      detail: text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 6)
        .join('；'),
    }
  } catch {
    return null
  }
}

export function androidEmptyDeviceHint(usb?: WindowsUsbHint | null): string {
  if (usb?.huaweiHdb || usb?.huaweiPresent) {
    return (
      '已检测到华为手机（当前为 MTP/HDB，尚未出现 ADB 接口）。HarmonyOS 请按官方步骤：' +
      '① 开发者选项同时打开「USB 调试」和「仅充电模式下允许ADB调试」；' +
      '② 连接电脑后通知栏选「传输文件」或「传输照片」；' +
      '③ 退出华为手机助手；④ 拔插线并在手机上点允许 USB 调试；' +
      '⑤ 设备管理器里应出现 “ADB Interface / Android Composite ADB”。' +
      '若 USB 仍不行，可改用下方「无线调试」：手机开无线调试后填 IP:端口 连接。'
    )
  }
  return (
    'adb 已就绪但未发现设备。请开启 USB 调试，USB 用途选「传输文件」，' +
    '解锁手机并允许调试后刷新。华为/HarmonyOS 请同时打开「仅充电模式下允许ADB调试」，' +
    '或改用下方无线调试。'
  )
}
