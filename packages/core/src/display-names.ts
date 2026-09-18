/**
 * Extract human-facing titles from source / resource files (no LLM).
 * Priority helpers used by the display-name pipeline.
 */

export function extractAndroidStringTitles(xml: string): string[] {
  const titles: string[] = []
  const re = /<string\s+name="([^"]+)"[^>]*>([^<]+)<\/string>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml))) {
    const name = m[1] ?? ''
    const value = (m[2] ?? '').trim()
    if (!value) continue
    if (/title|label|header|name|page/i.test(name) || value.length <= 20) {
      titles.push(value)
    }
  }
  return unique(titles)
}

export function extractLayoutTitles(xml: string): string[] {
  const titles: string[] = []
  const re =
    /android:(?:text|hint|contentDescription|title)="(@string\/[a-zA-Z0-9_]+|[^"]+)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml))) {
    const raw = (m[1] ?? '').trim()
    if (!raw.startsWith('@') && raw.length > 0 && raw.length <= 40) {
      titles.push(raw)
    }
  }
  return unique(titles)
}

export function extractObjCNavTitles(source: string): string[] {
  const titles: string[] = []
  const patterns = [
    /navigationItem\.title\s*=\s*@?"([^"]+)"/g,
    /title\s*=\s*@?"([^"]+)"/g,
    /NSLocalizedString\(\s*@"([^"]+)"/g,
  ]
  for (const re of patterns) {
    let m: RegExpExecArray | null
    while ((m = re.exec(source))) {
      const v = (m[1] ?? '').trim()
      if (v) titles.push(v)
    }
  }
  return unique(titles)
}

export function extractKotlinUiTitles(source: string): string[] {
  const titles: string[] = []
  const patterns = [
    /(?:setTitle|title)\s*\(\s*"([^"]+)"\s*\)/g,
    /(?:setTitle|title)\s*\(\s*R\.string\.([a-zA-Z0-9_]+)\s*\)/g,
    /Text\(\s*"([^"]+)"\s*\)/g,
    /stringResource\(\s*R\.string\.([a-zA-Z0-9_]+)\s*\)/g,
  ]
  for (const re of patterns) {
    let m: RegExpExecArray | null
    while ((m = re.exec(source))) {
      const v = (m[1] ?? '').trim()
      if (v && !v.startsWith('R.')) titles.push(v)
    }
  }
  return unique(titles)
}

export function extractLocalizableTitles(stringsFile: string): string[] {
  const titles: string[] = []
  const re = /"([^"]+)"\s*=\s*"([^"]+)"\s*;/g
  let m: RegExpExecArray | null
  while ((m = re.exec(stringsFile))) {
    const key = m[1] ?? ''
    const value = (m[2] ?? '').trim()
    if (!value) continue
    if (/title|label|header|name|page|nav/i.test(key) || value.length <= 24) {
      titles.push(value)
    }
  }
  return unique(titles)
}

function unique(items: string[]): string[] {
  return [...new Set(items)]
}

export function pickBestTitle(candidates: string[], fallback: string): string {
  if (candidates.length === 0) return fallback
  // Prefer short Chinese / clear product labels over long sentences.
  const ranked = [...candidates].sort((a, b) => {
    const score = (s: string) => {
      let n = 0
      if (/[\u4e00-\u9fff]/.test(s)) n += 3
      if (s.length <= 12) n += 2
      if (s.length <= 20) n += 1
      if (/^https?:/.test(s)) n -= 5
      return n
    }
    return score(b) - score(a)
  })
  return ranked[0] ?? fallback
}
