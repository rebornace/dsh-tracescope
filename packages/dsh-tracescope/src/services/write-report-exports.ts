/**
 * Persist markdown/csv impact exports next to an analysis run.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

export async function writeReportExports(
  exportDir: string,
  markdown: string,
  csv: string,
): Promise<void> {
  await mkdir(exportDir, { recursive: true })
  await writeFile(path.join(exportDir, 'tracescope-report.md'), markdown, 'utf8')
  await writeFile(path.join(exportDir, 'tracescope-report.csv'), csv, 'utf8')
}
