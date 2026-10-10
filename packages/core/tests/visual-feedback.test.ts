import { describe, expect, it } from 'vitest'
import {
  buildTrackerFeedbackDescription,
  buildVisualDiffFeedbackDescription,
  buildVisualDiffFeedbackSubject,
} from '../src/tracker/index.js'
import type { ScopeItem } from '../src/types.js'

const item: ScopeItem = {
  id: 'ui-1',
  displayName: 'Title color mismatch',
  kind: 'direct',
  risk: 'high',
  files: ['src/Title.tsx'],
  evidence: [],
  suggestedSteps: ['Use design token'],
  status: 'fail',
  testerNote: 'Expected: #111\nActual: #222',
}

describe('visual-diff tracker feedback', () => {
  it('builds English UI-review body without impact commit wording', () => {
    const body = buildVisualDiffFeedbackDescription({
      repoPath: '/tmp/app',
      items: [item],
      lang: 'en',
      meta: {
        designName: 'Home',
        designUrl: 'https://figma.com/file/x',
        codePath: 'src/Title.tsx',
        platformLabel: 'Web / React',
      },
    })
    expect(body).toContain('UI review diff feedback')
    expect(body).toContain('Design: Home')
    expect(body).toContain('Design URL: https://figma.com/file/x')
    expect(body).toContain('Code file:')
    expect(body).toContain('Title color mismatch')
    expect(body).toContain('Expected: #111')
    expect(body).not.toContain('Base commit')
    expect(body).not.toContain('verification failure')
  })

  it('builds Chinese UI-review body with real CJK', () => {
    const body = buildVisualDiffFeedbackDescription({
      repoPath: '/tmp/app',
      items: [item],
      lang: 'zh',
      meta: { designName: '\u9996\u9875', codePath: 'src/Title.tsx' },
    })
    expect(body).toMatch(/UI \u8d70\u67e5\u5dee\u5f02\u53cd\u9988/)
    expect(body).toContain('\u8bbe\u8ba1\u7a3f')
    expect(/[\u4e00-\u9fff]/.test(body)).toBe(true)
  })

  it('routes through buildTrackerFeedbackDescription by kind', () => {
    const visual = buildTrackerFeedbackDescription({
      kind: 'visual-diff',
      repoPath: '/r',
      baseCommit: 'design',
      headCommit: 'code',
      items: [item],
      lang: 'en',
      visualMeta: { designName: 'Home' },
    })
    const impact = buildTrackerFeedbackDescription({
      kind: 'impact',
      repoPath: '/r',
      baseCommit: 'aaa',
      headCommit: 'bbb',
      items: [item],
      lang: 'en',
    })
    expect(visual).toContain('UI review diff feedback')
    expect(impact).toContain('verification failure feedback')
    expect(impact).toContain('Base commit')
  })

  it('builds a UI-review subject', () => {
    const subject = buildVisualDiffFeedbackSubject(
      [item],
      { designName: 'Home', codePath: 'a.tsx' },
      'en',
    )
    expect(subject).toContain('[UI review]')
    expect(subject).toContain('Home')
    expect(subject).toContain('Title color mismatch')
  })
})
