import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { analyzeCrash } from '../src/crash/analyze.js'
import { buildCrashDefectSubject } from '../src/crash/feedback.js'
import type { CrashIncident } from '../src/crash/types.js'

const incident: CrashIncident = {
  id: '1',
  title: 'NPE Login',
  provider: 'local',
  exceptionName: 'java.lang.NullPointerException',
  appVersion: '1.2.3',
  count: 42,
  stackText:
    'java.lang.NullPointerException: x\n\tat com.example.LoginActivity.onCreate(LoginActivity.kt:88)',
}

async function emptyRepoPath(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'crash-analyze-empty-'))
}

describe('analyzeCrash feedback', () => {
  it('builds zh prompt and defect body', async () => {
    const repoPath = await emptyRepoPath()
    const report = await analyzeCrash({
      incident,
      repoPath,
      lang: 'zh',
    })
    expect(report.prompt).toContain('\u5d29\u6e83\u5206\u6790')
    expect(report.prompt).toContain('NullPointerException')
    expect(report.defectBody).toContain('\u5d29\u6e83')
    expect(report.summary.length).toBeGreaterThan(0)
    expect(report.summary).toContain('\u672a\u547d\u4e2d')
  })

  it('builds en prompt', async () => {
    const repoPath = await emptyRepoPath()
    const report = await analyzeCrash({ incident, repoPath, lang: 'en' })
    expect(report.prompt).toMatch(/Crash analysis/i)
    expect(report.summary).toMatch(/No repo file matched/i)
  })
})

describe('buildCrashDefectSubject', () => {
  it('uses zh crash prefix', () => {
    const subject = buildCrashDefectSubject(
      { id: '1', title: 'NPE Login', provider: 'local', stackText: 'x' },
      'zh',
    )
    expect(subject.startsWith('[\u5d29\u6e83]')).toBe(true)
    expect(subject).toContain('NPE Login')
  })

  it('uses en crash prefix', () => {
    const subject = buildCrashDefectSubject(
      { id: '1', title: 'NPE Login', provider: 'local', stackText: 'x' },
      'en',
    )
    expect(subject.startsWith('[Crash]')).toBe(true)
    expect(subject).toContain('NPE Login')
  })
})
