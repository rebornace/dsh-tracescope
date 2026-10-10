import { describe, expect, it } from 'vitest'
import { buildCrashPrompt } from '../src/crash/feedback.js'

describe('buildCrashPrompt with jobId', () => {
  it('embeds job id, skill, and publish tool when jobId is set', () => {
    const prompt = buildCrashPrompt(
      {
        repoPath: '/repo',
        summary: 'NPE',
        matchedFiles: [],
        fixHints: [],
        stackText: 'NullPointerException',
        incident: {
          id: 'c1',
          title: 'NPE',
          provider: 'local',
          stackText: 'NullPointerException',
        },
        jobId: 'job-crash-1',
      },
      'zh',
    )
    expect(prompt).toContain('job-crash-1')
    expect(prompt).toContain('tracescope-crash-analysis')
    expect(prompt).toContain('tracescope_publish_crash_analysis')
  })

  it('omits publish instructions without jobId', () => {
    const prompt = buildCrashPrompt(
      {
        repoPath: '/repo',
        summary: 'NPE',
        matchedFiles: [],
        fixHints: [],
        stackText: 'NullPointerException',
        incident: {
          id: 'c1',
          title: 'NPE',
          provider: 'local',
          stackText: 'NullPointerException',
        },
      },
      'en',
    )
    expect(prompt).not.toContain('tracescope_publish_crash_analysis')
  })
})
