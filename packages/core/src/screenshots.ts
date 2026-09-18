import type { TesterScreenshot } from './types.js'

export const MAX_TESTER_SCREENSHOTS = 3
/** Soft cap per image after client-side compress (~350KB). */
export const MAX_SCREENSHOT_DATA_URL_CHARS = 480_000

/** Normalize / clamp screenshot attachments from API or storage. */
export function normalizeTesterScreenshots(raw: unknown): TesterScreenshot[] {
  if (!Array.isArray(raw)) return []
  const out: TesterScreenshot[] = []
  const seen = new Set<string>()
  for (const row of raw) {
    if (out.length >= MAX_TESTER_SCREENSHOTS) break
    if (!row || typeof row !== 'object') continue
    const o = row as Record<string, unknown>
    const dataUrl = String(o.dataUrl ?? '').trim()
    if (!dataUrl.startsWith('data:image/')) continue
    if (dataUrl.length > MAX_SCREENSHOT_DATA_URL_CHARS) continue
    const id = String(o.id ?? '').trim() || `shot-${out.length + 1}`
    if (seen.has(id)) continue
    seen.add(id)
    const mimeMatch = /^data:(image\/[a-z0-9.+-]+);/i.exec(dataUrl)
    const mime = String(o.mime ?? mimeMatch?.[1] ?? 'image/jpeg').trim() || 'image/jpeg'
    const name = String(o.name ?? `screenshot-${out.length + 1}.jpg`).trim().slice(0, 120)
    out.push({ id, name: name || `screenshot-${out.length + 1}.jpg`, mime, dataUrl })
  }
  return out
}
