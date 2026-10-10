import type { CrashIncident } from './types.js'

export interface ResolveExceptionNameOptions {
  /** From {@link parseStackText} when available. */
  parsedExceptionName?: string
  /** Stack text override; defaults to `incident.stackText`. */
  stackText?: string
}

/** Single source for exception labels in analyze + feedback builders. */
export function resolveExceptionName(
  incident: CrashIncident,
  options?: ResolveExceptionNameOptions,
): string {
  if (incident.exceptionName?.trim()) return incident.exceptionName.trim()
  if (options?.parsedExceptionName?.trim()) return options.parsedExceptionName.trim()

  const stackText = (options?.stackText ?? incident.stackText).trim()
  if (stackText) {
    const firstLine = stackText.split(/\r?\n/, 1)[0]?.trim() ?? ''
    const colon = firstLine.indexOf(': ')
    if (colon > 0) return firstLine.slice(0, colon).trim()
    if (firstLine) return firstLine
  }

  const title = incident.title.trim()
  if (title) return title
  return 'Unknown exception'
}
