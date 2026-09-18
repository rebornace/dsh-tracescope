import { readFile } from 'node:fs/promises'

export interface LocalCrashBundle {
  sourcePath: string
  text: string
}

/** Load a crash/syslog text file for attachment to a TraceScope task. */
export async function importLocalCrashFile(filePath: string): Promise<LocalCrashBundle> {
  const text = await readFile(filePath, 'utf8')
  return { sourcePath: filePath, text }
}
