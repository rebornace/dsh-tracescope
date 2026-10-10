import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildTrackerFeedbackDescription } from '../src/tracker/build-description.js'
import { submitFailFeedback } from '../src/tracker/orchestrator.js'
import { getTrackerAdapter } from '../src/tracker/registry.js'
import { buildCrashDefectBody, buildCrashDefectSubject } from '../src/crash/feedback.js'
import type { CrashIncident } from '../src/crash/types.js'
import type { TrackerConfig } from '../src/tracker/types.js'

const incident: CrashIncident = {
  id: '1',
  title: 'NPE',
  provider: 'local',
  stackText: 'java.lang.NPE\n\tat a.b(C.kt:1)',
}

describe('crash tracker feedback', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('buildTrackerFeedbackDescription uses crash body when kind=crash', () => {
    const body = buildCrashDefectBody({
      incident,
      matchedFiles: [],
      summary: 'summary',
      lang: 'zh',
    })
    const desc = buildTrackerFeedbackDescription({
      kind: 'crash',
      repoPath: '/repo',
      baseCommit: '',
      headCommit: '',
      items: [],
      prebuiltDescription: body,
      lang: 'zh',
    })
    expect(desc).toBe(body)
  })

  it('buildTrackerFeedbackDescription builds from crashMeta when no prebuilt body', () => {
    const desc = buildTrackerFeedbackDescription({
      kind: 'crash',
      repoPath: '/repo',
      baseCommit: '',
      headCommit: '',
      items: [],
      lang: 'en',
      crashMeta: {
        incident,
        matchedFiles: [],
        summary: 'No repo file matched',
      },
    })
    expect(desc).toContain('TraceScope crash analysis report')
    expect(desc).toContain('java.lang.NPE')
  })

  it('submitFailFeedback uses crash subject and prebuilt description', async () => {
    const body = buildCrashDefectBody({
      incident,
      matchedFiles: [],
      summary: 'summary',
      lang: 'zh',
    })
    const expectedSubject = buildCrashDefectSubject(incident, 'zh')
    const adapter = getTrackerAdapter('webhook')!
    const submitSpy = vi.spyOn(adapter, 'submit').mockResolvedValue({
      ok: true,
      provider: 'webhook',
      url: 'https://example.com/hook',
    })
    const config: TrackerConfig = { provider: 'webhook', webhook: { url: 'https://example.com/hook' } }
    const result = await submitFailFeedback(config, {
      repoPath: '/repo',
      baseCommit: '',
      headCommit: '',
      items: [],
      feedbackKind: 'crash',
      prebuiltDescription: body,
      crashMeta: { incident, matchedFiles: [], summary: 'summary' },
      lang: 'zh',
    })
    expect(result.ok).toBe(true)
    expect(submitSpy).toHaveBeenCalledOnce()
    const ctx = submitSpy.mock.calls[0]![1]
    expect(ctx.subject).toBe(expectedSubject)
    expect(ctx.description).toBe(body)
    expect(ctx.feedbackKind).toBe('crash')
    expect(ctx.items).toEqual([])
  })
})
