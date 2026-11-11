/**
 * Pure parsers for Android logcat crash / ANR blocks (no adb dependency).
 */

export type AndroidLogcatHitKind = 'crash' | 'anr'

export interface AndroidLogcatHit {
  kind: AndroidLogcatHitKind
  /** Human-readable title (exception or ANR process). */
  title: string
  exceptionName?: string
  stackText: string
}

const FATAL_RE = /\bFATAL EXCEPTION:\s*(\S+)/i
const ANDROID_RUNTIME_FATAL = /AndroidRuntime\s*:\s*FATAL EXCEPTION/i
const EXCEPTION_LINE_RE = /(?:AndroidRuntime|System\.err)\s*:\s*((?:[a-zA-Z_][\w.$]*\.)+[a-zA-Z_][\w.$]*(?:Error|Exception|Throwable)\b[^\r\n]*)/
const ANR_RE = /\bANR in\s+([^\r\n]+)/i
const STACK_LINE_RE = /(?:AndroidRuntime|System\.err)\s*:\s*(\s+at\s+[^\r\n]+|Caused by:[^\r\n]*)/

/**
 * Scan a logcat chunk (or full buffer) and extract crash / ANR blocks.
 * Dedupes consecutive identical titles within the same buffer.
 */
export function extractAndroidLogcatHits(chunk: string): AndroidLogcatHit[] {
  if (!chunk.trim()) return []
  const lines = chunk.split(/\r?\n/)
  const hits: AndroidLogcatHit[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i] ?? ''
    const anr = line.match(ANR_RE)
    if (anr) {
      const processName = (anr[1] || 'unknown').trim()
      const block: string[] = [line]
      i += 1
      while (i < lines.length) {
        const next = lines[i] ?? ''
        if (FATAL_RE.test(next) || ANDROID_RUNTIME_FATAL.test(next) || ANR_RE.test(next)) break
        block.push(next)
        i += 1
        if (block.length > 80) break
      }
      hits.push({
        kind: 'anr',
        title: `ANR in ${processName}`.slice(0, 200),
        stackText: block.join('\n').trim(),
      })
      continue
    }

    if (FATAL_RE.test(line) || ANDROID_RUNTIME_FATAL.test(line)) {
      const block: string[] = [line]
      let exceptionName: string | undefined
      let title = 'FATAL EXCEPTION'
      const thread = line.match(FATAL_RE)?.[1]
      if (thread) title = `FATAL EXCEPTION: ${thread}`
      i += 1
      while (i < lines.length) {
        const next = lines[i] ?? ''
        if (
          (FATAL_RE.test(next) || ANDROID_RUNTIME_FATAL.test(next) || ANR_RE.test(next)) &&
          block.length > 1
        ) {
          break
        }
        block.push(next)
        if (!exceptionName) {
          const ex = next.match(EXCEPTION_LINE_RE)
          if (ex?.[1]) {
            exceptionName = ex[1].trim()
            title = exceptionName.slice(0, 200)
          }
        }
        i += 1
        // Keep collecting while stack-ish; stop after a quiet gap of non-stack lines.
        if (block.length > 120) break
        if (
          block.length > 8 &&
          !STACK_LINE_RE.test(next) &&
          !EXCEPTION_LINE_RE.test(next) &&
          !/AndroidRuntime\s*:/.test(next) &&
          !/^\s*$/.test(next)
        ) {
          // allow a few trailing Process: lines
          if (!/\bProcess:\s*/i.test(next) && !/\bPID:\s*/i.test(next)) break
        }
      }
      hits.push({
        kind: 'crash',
        title,
        exceptionName,
        stackText: block.join('\n').trim(),
      })
      continue
    }
    i += 1
  }

  // Dedupe identical titles back-to-back (logcat may repeat).
  const out: AndroidLogcatHit[] = []
  for (const hit of hits) {
    const prev = out[out.length - 1]
    if (prev && prev.title === hit.title && prev.kind === hit.kind) continue
    out.push(hit)
  }
  return out
}
