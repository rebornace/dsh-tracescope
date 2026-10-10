/**
 * Parse pasted JVM/Android stack traces into structured frames.
 */
export interface StackFrame {
  className?: string
  method?: string
  fileName?: string
  line?: number
  raw: string
}

export interface ParsedStack {
  exceptionName?: string
  message?: string
  frames: StackFrame[]
}

/** `at pkg.Outer.Inner.method(File.kt:42)` and `.java` variants. */
const FRAME_LINE =
  /^\s*at\s+(.+)\.([^.()]+)\(([^:]+):(\d+)\)\s*$/

export function parseStackText(text: string): ParsedStack {
  const trimmed = text.trim()
  if (!trimmed) {
    return { frames: [] }
  }

  const lines = trimmed.split(/\r?\n/)
  const firstLine = lines[0]?.trim() ?? ''

  let exceptionName: string | undefined
  let message: string | undefined
  const colonSpace = firstLine.indexOf(': ')
  if (colonSpace > 0) {
    exceptionName = firstLine.slice(0, colonSpace).trim()
    message = firstLine.slice(colonSpace + 2).trim()
  } else {
    exceptionName = firstLine || undefined
  }

  const frames: StackFrame[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const match = line.match(FRAME_LINE)
    if (!match) continue
    const lineNum = Number.parseInt(match[4] ?? '', 10)
    frames.push({
      className: match[1],
      method: match[2],
      fileName: match[3],
      line: Number.isFinite(lineNum) ? lineNum : undefined,
      raw: line.trim(),
    })
  }

  return { exceptionName, message, frames }
}
