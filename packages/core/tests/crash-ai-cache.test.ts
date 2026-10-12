import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  clearCrashAiAnalysis,
  crashAiAnalysisKey,
  loadCrashAiAnalysis,
  saveCrashAiAnalysis,
} from '../src/crash/ai-cache.js'

describe('crash AI analysis cache', () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const d of dirs.splice(0)) {
      try {
        rmSync(d, { recursive: true, force: true })
      } catch {
        /* ignore */
      }
    }
  })

  function tempRoot(): string {
    const d = mkdtempSync(join(tmpdir(), 'ts-crash-ai-'))
    dirs.push(d)
    return d
  }

  it('keys by repo + incident id', () => {
    const a = crashAiAnalysisKey('/repo/a', 'issue-1')
    const b = crashAiAnalysisKey('/repo/a', 'issue-2')
    const c = crashAiAnalysisKey('/repo/b', 'issue-1')
    expect(a).toBeTruthy()
    expect(a).not.toBe(b)
    expect(a).not.toBe(c)
    expect(crashAiAnalysisKey('', 'x')).toBeNull()
    expect(crashAiAnalysisKey('/repo', '  ')).toBeNull()
  })

  it('saves, loads, and clears under cache root', async () => {
    const root = tempRoot()
    const repo = join(root, 'app')
    const saved = await saveCrashAiAnalysis(repo, 'inc-1', 'root cause: NPE', {
      summary: 'local summary',
      cacheRoot: root,
    })
    expect(saved?.payload.aiAnalysis).toBe('root cause: NPE')
    expect(saved?.savedAt).toBeTruthy()

    const loaded = await loadCrashAiAnalysis(repo, 'inc-1', root)
    expect(loaded?.payload.aiAnalysis).toBe('root cause: NPE')
    expect(loaded?.payload.summary).toBe('local summary')

    expect(await loadCrashAiAnalysis(repo, 'other', root)).toBeNull()

    await expect(clearCrashAiAnalysis(repo, 'inc-1', root)).resolves.toBe(true)
    expect(await loadCrashAiAnalysis(repo, 'inc-1', root)).toBeNull()
  })

  it('ignores empty analysis', async () => {
    const root = tempRoot()
    await expect(saveCrashAiAnalysis(join(root, 'app'), 'inc', '   ', { cacheRoot: root })).resolves.toBeNull()
  })
})
