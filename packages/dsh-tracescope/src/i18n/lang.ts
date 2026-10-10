import fs from 'node:fs'
import path from 'node:path'

export type Lang = 'zh' | 'en'

export function langFromTag(raw: unknown): Lang | null {
  if (typeof raw !== 'string') return null
  const s = raw.trim().toLowerCase()
  if (s === 'en' || s.startsWith('en-') || s.startsWith('en_')) return 'en'
  if (s === 'zh' || s.startsWith('zh-') || s.startsWith('zh_')) return 'zh'
  return null
}

export function langFromRequest(req: {
  headers: Record<string, string | string[] | undefined>
}): Lang {
  const raw = req.headers['accept-language']
  const header = Array.isArray(raw) ? raw[0] : raw
  if (!header) return 'zh'
  for (const part of String(header).split(',')) {
    const tag = part.split(';')[0]?.trim().toLowerCase() ?? ''
    if (tag === 'en' || tag.startsWith('en-')) return 'en'
  }
  return 'zh'
}

export function langFromBody(body: Record<string, unknown>, fallback?: Lang): Lang {
  const raw = body.locale ?? body.lang
  if (typeof raw === 'string') {
    const s = raw.trim().toLowerCase()
    if (s === 'en' || s.startsWith('en-')) return 'en'
    if (s === 'zh' || s.startsWith('zh-')) return 'zh'
  }
  return fallback ?? 'zh'
}

/**
 * Best-effort Host language (defaults zh): locale service → env → settings.yaml.
 * Shared by skills, agent tool summaries, and other non-HTTP surfaces.
 */
export function resolveHostLang(ctx?: {
  locale?: { getLocale?: () => { active?: string } }
  get?: (name: string) => unknown
}): Lang {
  try {
    const locale =
      ctx?.locale ??
      (typeof ctx?.get === 'function'
        ? (ctx.get('locale') as { getLocale?: () => { active?: string } } | undefined)
        : undefined)
    const fromSvc = langFromTag(locale?.getLocale?.()?.active)
    if (fromSvc) return fromSvc
  } catch {
    /* ignore */
  }
  const fromEnv =
    langFromTag(process.env.DSH_LOCALE) ||
    langFromTag(process.env.LANG) ||
    langFromTag(process.env.LC_ALL)
  if (fromEnv) return fromEnv
  try {
    const home = process.env.DSH_HOME
    if (home) {
      const yaml = fs.readFileSync(path.join(home, 'settings.yaml'), 'utf8')
      const m =
        yaml.match(/locale\.preference\s*:\s*["']?([A-Za-z_-]+)/i) ||
        yaml.match(/preference\s*:\s*["']?(en|zh)["']?/i)
      const fromYaml = langFromTag(m?.[1])
      if (fromYaml) return fromYaml
    }
  } catch {
    /* ignore */
  }
  return 'zh'
}
