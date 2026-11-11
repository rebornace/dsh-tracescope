/**
 * Parse pasted crash stacks into structured frames.
 * Covers Android/JVM, Crashlytics `at symbol (file:line)`, iOS crash reports,
 * Android native `pc` frames, and JavaScript / React Native stacks.
 */
export type StackFrameKind = 'jvm' | 'ios' | 'native' | 'js'

export interface StackFrame {
  className?: string
  method?: string
  fileName?: string
  line?: number
  column?: number
  library?: string
  /** Runtime or PC address (iOS slide / native pc). */
  address?: string
  /** iOS binary load address, when the frame is not yet symbolicated. */
  loadAddress?: string
  raw: string
  kind: StackFrameKind
}

export interface ParsedStack {
  exceptionName?: string
  message?: string
  frames: StackFrame[]
}

const PLACEHOLDER_FILES = new Set([
  '',
  'sourcefile',
  'unknown source',
  'native method',
  'null',
  '<anonymous>',
  '[native code]',
  'native',
])

/** True when the stack file token is not a real source path. */
export function isPlaceholderFile(fileName: string | undefined): boolean {
  if (!fileName) return true
  return PLACEHOLDER_FILES.has(fileName.trim().toLowerCase())
}

/** Split `pkg.Class.method` / `Type.method()` into class + method. */
export function splitDebugSymbol(symbol: string): { className?: string; method?: string } {
  const trimmed = symbol.trim()
  if (!trimmed) return {}
  const objc = trimmed.match(/^[-+]\[(.+)\s+(.+)\]$/)
  if (objc) return { className: objc[1], method: objc[2] }
  const noArgs = trimmed.replace(/\(.*$/, '').trim()
  if (!noArgs || /\s/.test(noArgs)) return { method: trimmed }
  const dot = noArgs.lastIndexOf('.')
  if (dot <= 0) return { method: trimmed }
  return { className: noArgs.slice(0, dot), method: noArgs.slice(dot + 1) }
}

/** `File.kt:88`, `File.swift:24:0`, `line 12`, or a bare file name. */
export function parseCodeLocation(loc: string): { fileName?: string; line?: number; column?: number } {
  const t = loc.trim()
  if (!t) return {}
  const lineOnly = t.match(/^line\s+(\d+)$/i)
  if (lineOnly) {
    const line = Number.parseInt(lineOnly[1] ?? '', 10)
    return { line: Number.isFinite(line) ? line : undefined }
  }
  const withColumn = t.match(/^(.+):(\d+):(\d+)$/)
  if (withColumn && !withColumn[1]?.includes(' ')) {
    return {
      fileName: withColumn[1],
      line: numberOrUndefined(withColumn[2]),
      column: numberOrUndefined(withColumn[3]),
    }
  }
  const withLine = t.match(/^(.+):(\d+)$/)
  if (withLine && !withLine[1]?.includes(' ')) {
    return { fileName: withLine[1], line: numberOrUndefined(withLine[2]) }
  }
  return { fileName: t }
}

function numberOrUndefined(raw: string | undefined): number | undefined {
  if (!raw) return undefined
  const value = Number.parseInt(raw, 10)
  return Number.isFinite(value) ? value : undefined
}

function kindFromFile(fileName: string | undefined, fallback: StackFrameKind): StackFrameKind {
  const base = fileName?.replace(/\\/g, '/').split('/').pop()?.toLowerCase() ?? ''
  if (/\.(swift|m|mm|h)$/.test(base)) return 'ios'
  if (/\.(js|jsx|mjs|cjs|ts|tsx)$/.test(base)) return 'js'
  if (/\.(java|kt|kts)$/.test(base)) return 'jvm'
  return fallback
}

function frame(partial: Omit<StackFrame, 'raw'> & { raw?: string }, raw: string): StackFrame {
  return { ...partial, raw: partial.raw ?? raw.trim() }
}

function tryParseNative(line: string): StackFrame | undefined {
  const match = line.match(/^\s*(?:#\d+\s+)?pc\s+([0-9a-fA-F]+)\s+(\S+)(?:\s+\(([^)]*)\))?\s*$/)
  if (!match) return undefined
  const address = match[1] ?? ''
  const library = match[2] ?? ''
  const inner = (match[3] ?? '').replace(/\+.*$/, '').trim()
  const symbol = inner.includes('.') ? splitDebugSymbol(inner) : { method: inner || undefined }
  return frame(
    {
      kind: 'native',
      address: address.startsWith('0x') ? address : `0x${address}`,
      library,
      className: symbol.className,
      method: symbol.method,
    },
    line,
  )
}

function tryParseIos(line: string): StackFrame | undefined {
  const match = line.match(/^\s*(\d+)\s+(\S+)\s+(0x[0-9a-fA-F]+)\s+(.*)$/)
  if (!match) return undefined
  const library = match[2] ?? ''
  const address = match[3] ?? ''
  const rest = (match[4] ?? '').trim()
  const unsymbolicated = rest.match(/^(0x[0-9a-fA-F]+)\s+\+\s+\d+\s*$/)
  if (unsymbolicated) {
    return frame(
      { kind: 'ios', library, address, loadAddress: unsymbolicated[1] },
      line,
    )
  }
  const withFile = rest.match(/^(.*?)(?:\s+\+\s+\d+)?\s+\(([^)]+)\)\s*$/)
  if (withFile) {
    const loc = parseCodeLocation(withFile[2] ?? '')
    const symbol = splitDebugSymbol((withFile[1] ?? '').trim())
    return frame(
      {
        kind: kindFromFile(loc.fileName, 'ios'),
        library,
        address,
        className: symbol.className,
        method: symbol.method,
        fileName: loc.fileName,
        line: loc.line,
        column: loc.column,
      },
      line,
    )
  }
  const symbol = splitDebugSymbol(rest.replace(/\s+\+\s+\d+\s*$/, '').trim())
  return frame(
    {
      kind: 'ios',
      library,
      address,
      className: symbol.className,
      method: symbol.method,
    },
    line,
  )
}

function tryParseJs(line: string): StackFrame | undefined {
  const withFn = line.match(
    /^\s*at\s+(?:async\s+)?(.+?)\s+\((?:[^()]*\s)?([^()\s]+):(\d+):(\d+)\)\s*$/,
  )
  if (withFn) {
    const loc = parseCodeLocation(`${withFn[2]}:${withFn[3]}:${withFn[4]}`)
    const symbol = splitDebugSymbol(withFn[1] ?? '')
    return frame(
      {
        kind: 'js',
        className: symbol.className,
        method: symbol.method ?? withFn[1],
        fileName: loc.fileName,
        line: loc.line,
        column: loc.column,
      },
      line,
    )
  }
  const bare = line.match(/^\s*at\s+(?:async\s+)?([^()\s]+):(\d+):(\d+)\s*$/)
  if (!bare) return undefined
  const loc = parseCodeLocation(`${bare[1]}:${bare[2]}:${bare[3]}`)
  return frame(
    { kind: 'js', fileName: loc.fileName, line: loc.line, column: loc.column },
    line,
  )
}

function tryParseJvm(line: string): StackFrame | undefined {
  const match = line.match(/^\s*at\s+(\S+)\(([^)]*)\)\s*$/)
  if (!match) return undefined
  const qualified = match[1] ?? ''
  const dot = qualified.lastIndexOf('.')
  if (dot <= 0) return undefined
  const loc = parseCodeLocation(match[2] ?? '')
  return frame(
    {
      kind: kindFromFile(loc.fileName, 'jvm'),
      className: qualified.slice(0, dot),
      method: qualified.slice(dot + 1),
      fileName: loc.fileName,
      line: loc.line,
      column: loc.column,
    },
    line,
  )
}

function tryParseAtLocation(line: string): StackFrame | undefined {
  const hex = line.match(/^\s*at\s+(0x[0-9a-fA-F]+)(?:\s+\[([^\]]+)\])?/)
  if (hex && !line.includes('(')) {
    return frame(
      { kind: 'ios', address: hex[1], library: hex[2]?.trim() },
      line,
    )
  }
  const match = line.match(/^\s*at\s+(.+)\s+\(([^)]*)\)(?:\s+\[([^\]]+)\])?/)
  if (!match) return undefined
  const loc = parseCodeLocation(match[2] ?? '')
  const symbol = splitDebugSymbol((match[1] ?? '').trim())
  const library = match[3]?.trim()
  return frame(
    {
      kind: kindFromFile(loc.fileName, library ? 'ios' : 'jvm'),
      className: symbol.className,
      method: symbol.method,
      fileName: loc.fileName,
      line: loc.line,
      column: loc.column,
      library,
    },
    line,
  )
}

function tryParseFrame(line: string): StackFrame | undefined {
  return (
    tryParseNative(line) ??
    tryParseIos(line) ??
    tryParseJs(line) ??
    tryParseJvm(line) ??
    tryParseAtLocation(line)
  )
}

function isIgnorableStackLine(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) return true
  if (/^thread\s+\d+/i.test(trimmed)) return true
  if (/^binary images:?$/i.test(trimmed)) return true
  if (/^caused by:/i.test(trimmed)) return true
  if (/^\*+/.test(trimmed)) return true
  return false
}

export function parseStackText(text: string): ParsedStack {
  const trimmed = text.trim()
  if (!trimmed) return { frames: [] }

  const frames: StackFrame[] = []
  let exceptionName: string | undefined
  let message: string | undefined
  let headerTaken = false

  for (const line of trimmed.split(/\r?\n/)) {
    const parsed = tryParseFrame(line)
    if (parsed) {
      frames.push(parsed)
      continue
    }
    if (headerTaken || isIgnorableStackLine(line)) continue
    headerTaken = true
    const header = line.trim()
    const colonSpace = header.indexOf(': ')
    if (colonSpace > 0) {
      exceptionName = header.slice(0, colonSpace).trim()
      message = header.slice(colonSpace + 2).trim()
    } else {
      exceptionName = header
    }
  }

  return { exceptionName, message, frames }
}

/** Rebuild a stack string from parsed frames (used after symbolication). */
export function renderParsedStack(parsed: ParsedStack): string {
  const lines: string[] = []
  if (parsed.exceptionName) {
    lines.push(parsed.message ? `${parsed.exceptionName}: ${parsed.message}` : parsed.exceptionName)
  }
  for (const item of parsed.frames) {
    const raw = item.raw.trim()
    lines.push(raw.startsWith('at ') ? `    ${raw}` : raw)
  }
  return lines.join('\n')
}
