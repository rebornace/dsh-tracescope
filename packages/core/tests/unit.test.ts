import { describe, expect, it } from 'vitest'
import {
  extractKotlinUiTitles,
  extractObjCNavTitles,
  pickBestTitle,
} from '../src/display-names.js'
import { heuristicDisplayName } from '../src/heuristics.js'
import { matchModuleRule } from '../src/modules-config.js'
import { exportReportCsv, exportReportMarkdown } from '../src/export.js'
import { isGitRemoteUrl, normalizeRemoteUrl } from '../src/repo.js'
import { adaptRemoteUrlForAuth, parseGitAuth } from '../src/auth.js'
import type { ImpactReport } from '../src/types.js'

describe('heuristics', () => {
  it('maps login-ish paths to product language', () => {
    expect(heuristicDisplayName('app/src/LoginActivity.kt')).toContain('登录')
  })
})

describe('display names', () => {
  it('extracts Kotlin titles', () => {
    const src = `
      class OrderActivity {
        fun onCreate() { setTitle("订单列表") }
      }
    `
    expect(extractKotlinUiTitles(src)).toContain('订单列表')
  })

  it('extracts ObjC nav titles', () => {
    const src = `self.navigationItem.title = @"支付结果";`
    expect(extractObjCNavTitles(src)).toContain('支付结果')
  })

  it('prefers Chinese short titles', () => {
    expect(pickBestTitle(['Very long English debugging string', '支付'], 'fallback')).toBe('支付')
  })
})

describe('modules config', () => {
  it('matches prefix rules', () => {
    const rule = matchModuleRule('android/app/src/main/java/com/example/pay/PayActivity.kt', [
      { match: 'com/example/pay*', name: '支付', risk: 'high' },
    ])
    expect(rule?.name).toBe('支付')
  })
})

describe('remote url detection', () => {
  it('detects http/ssh/shorthand remotes', () => {
    expect(isGitRemoteUrl('https://github.com/org/repo.git')).toBe(true)
    expect(isGitRemoteUrl('git@github.com:org/repo.git')).toBe(true)
    expect(isGitRemoteUrl('github.com/org/repo')).toBe(true)
    expect(isGitRemoteUrl('C:\\work\\app')).toBe(false)
    expect(isGitRemoteUrl('/home/u/app')).toBe(false)
  })

  it('normalizes host shorthand', () => {
    expect(normalizeRemoteUrl('github.com/org/repo')).toBe('https://github.com/org/repo')
  })

  it('rewrites ssh remotes when https auth is used', () => {
    expect(
      adaptRemoteUrlForAuth('git@github.com:org/repo.git', {
        mode: 'https',
        token: 'x',
      }),
    ).toBe('https://github.com/org/repo.git')
  })

  it('parses auth payloads', () => {
    expect(parseGitAuth({ mode: 'https', token: 't', username: 'u' })).toEqual({
      mode: 'https',
      token: 't',
      username: 'u',
    })
    expect(parseGitAuth({ mode: 'ssh', privateKeyPath: 'C:/keys/id' })).toEqual({
      mode: 'ssh',
      privateKeyPath: 'C:/keys/id',
    })
  })
})

describe('export', () => {
  const sample: ImpactReport = {
    repoPath: '/tmp/app',
    baseCommit: 'aaa',
    headCommit: 'bbb',
    generatedAt: '2026-01-01T00:00:00.000Z',
    modelEnriched: false,
    changedFiles: ['a.kt'],
    direct: [
      {
        id: '1',
        displayName: '订单列表',
        kind: 'direct',
        risk: 'high',
        files: ['a.kt'],
        evidence: [{ code: 'git_diff', detail: 'changed' }],
        suggestedSteps: ['打开订单列表'],
        status: 'pending',
      },
    ],
    ripple: [],
  }

  it('exports markdown with human display names', () => {
    const md = exportReportMarkdown(sample)
    expect(md).toContain('订单列表')
    expect(md).toContain('直接变更')
  })

  it('exports csv', () => {
    const csv = exportReportCsv(sample)
    expect(csv.split('\n')[0]).toContain('displayName')
    expect(csv.split('\n')[0]).toContain('testerNote')
    expect(csv).toContain('订单列表')
  })

  it('includes fail feedback notes for developers', () => {
    const md = exportReportMarkdown({
      ...sample,
      direct: [
        {
          ...sample.direct[0]!,
          status: 'fail',
          testerNote: '点击支付无响应，账号 test01',
          testerScreenshots: [
            {
              id: 's1',
              name: 'pay.png',
              mime: 'image/jpeg',
              dataUrl: 'data:image/jpeg;base64,aaa',
            },
          ],
        },
      ],
    })
    expect(md).toContain('失败反馈（给开发）')
    expect(md).toContain('点击支付无响应，账号 test01')
    expect(md).toContain('pay.png')
  })

  it('csv includes screenshotCount', () => {
    const csv = exportReportCsv(sample)
    expect(csv.split('\n')[0]).toContain('screenshotCount')
  })
})

describe('model diff analysis', () => {
  it('builds scope from model drafts and merges same-name items', async () => {
    const { analyzeReportWithModel, mergeScopeItems, parseModelScopeDrafts } = await import(
      '../src/enrich.js'
    )
    const drafts = parseModelScopeDrafts([
      {
        displayName: '登录',
        kind: 'direct',
        risk: 'high',
        files: ['LoginActivity.kt'],
        suggestedSteps: ['打开登录页'],
        evidence: '校验变更',
      },
      {
        displayName: '登录',
        kind: 'ripple',
        risk: 'medium',
        files: ['AuthRepo.kt'],
        suggestedSteps: ['退出后再登录'],
      },
    ])
    const merged = mergeScopeItems(
      drafts.map((d, i) => ({
        id: `id-${i}`,
        displayName: d.displayName,
        kind: d.kind ?? 'direct',
        risk: d.risk ?? 'medium',
        files: d.files ?? [],
        evidence: [{ code: 'model_diff', detail: d.evidence || '' }],
        suggestedSteps: d.suggestedSteps ?? [],
        status: 'pending' as const,
      })),
    )
    expect(merged).toHaveLength(1)
    expect(merged[0]?.files).toEqual(expect.arrayContaining(['LoginActivity.kt', 'AuthRepo.kt']))
    expect(merged[0]?.kind).toBe('direct')
    expect(merged[0]?.risk).toBe('high')

    const base: ImpactReport = {
      repoPath: '/tmp/app',
      baseCommit: 'aaa',
      headCommit: 'bbb',
      generatedAt: '2026-01-01T00:00:00.000Z',
      modelEnriched: false,
      changedFiles: [],
      direct: [],
      ripple: [],
    }
    // No changed files → passthrough with modelEnriched
    const empty = await analyzeReportWithModel(base, async () => {
      throw new Error('should not call model')
    })
    expect(empty.modelEnriched).toBe(true)
  })

  it('extracts JSON array from fenced model output', async () => {
    const { extractJsonArray, parseModelScopeDrafts } = await import('../src/enrich.js')
    const raw = extractJsonArray('```json\n[{"displayName":"支付","risk":"high"}]\n```')
    expect(parseModelScopeDrafts(raw)[0]?.displayName).toBe('支付')
  })
})

describe('chat publish helpers', () => {
  it('builds starter prompt with job id', async () => {
    const { buildChatAnalysisPrompt } = await import('../src/chat-prompt.js')
    const prompt = buildChatAnalysisPrompt({
      jobId: 'job-1',
      repoPath: '/tmp/app',
      baseCommit: 'aaa',
      headCommit: 'bbb',
    })
    expect(prompt).toContain('job-1')
    expect(prompt).toContain('tracescope_publish_handtest')
  })

  it('includes related agile work items in the starter prompt', async () => {
    const { buildChatAnalysisPrompt } = await import('../src/chat-prompt.js')
    const prompt = buildChatAnalysisPrompt({
      jobId: 'job-2',
      repoPath: '/tmp/app',
      baseCommit: 'aaa',
      headCommit: 'bbb',
      relatedWorkItems: [
        { id: 'wi-1', subject: '登录页改版', category: 'Req', description: '验证 SSO' },
      ],
    })
    expect(prompt).toContain('关联的敏捷工作项')
    expect(prompt).toContain('登录页改版')
    expect(prompt).toContain('wi-1')
  })

  it('parses published items into a model-enriched report', async () => {
    const { buildReportFromPublishedItems, parsePublishedHandtestItems } = await import(
      '../src/handtest-publish.js'
    )
    const items = parsePublishedHandtestItems([
      {
        displayName: '登录',
        kind: 'direct',
        risk: 'high',
        files: ['Login.kt'],
        suggestedSteps: ['打开登录'],
        evidence: '校验变更',
      },
    ])
    const report = buildReportFromPublishedItems({
      repoPath: '/tmp/app',
      baseCommit: 'a',
      headCommit: 'b',
      items,
    })
    expect(report.modelEnriched).toBe(true)
    expect(report.direct[0]?.displayName).toBe('登录')
  })
})

describe('handtest report key', () => {
  it('is stable for the same comparison pair', async () => {
    const { handtestReportKey } = await import('../src/report-store.js')
    const a = handtestReportKey('C:\\work\\app', 'abc', 'def')
    const b = handtestReportKey('c:/work/app', 'ABC', 'def')
    expect(a).toBe(b)
    expect(a).toHaveLength(32)
  })

  it('keeps a single history row per comparison pair', async () => {
    const { mkdtemp, rm } = await import('node:fs/promises')
    const os = await import('node:os')
    const path = await import('node:path')
    const {
      saveHandtestReport,
      loadHandtestReport,
      listHandtestHistory,
    } = await import('../src/report-store.js')
    const root = await mkdtemp(path.join(os.tmpdir(), 'tracescope-hist-'))
    try {
      const report1 = {
        repoPath: '/tmp/app',
        baseCommit: 'aaa',
        headCommit: 'bbb',
        generatedAt: '2026-01-01T00:00:00.000Z',
        modelEnriched: true,
        changedFiles: [],
        direct: [],
        ripple: [],
      }
      const first = await saveHandtestReport(
        {
          repoInput: '/tmp/app',
          baseCommit: 'aaa',
          headCommit: 'bbb',
          report: report1,
          source: 'model',
        },
        root,
      )
      const second = await saveHandtestReport(
        {
          repoInput: '/tmp/app',
          baseCommit: 'aaa',
          headCommit: 'bbb',
          report: { ...report1, generatedAt: '2026-01-02T00:00:00.000Z' },
          source: 'deterministic',
        },
        root,
      )
      expect(second.id).toBe(first.id)
      const latest = await loadHandtestReport('/tmp/app', 'aaa', 'bbb', root)
      expect(latest?.id).toBe(first.id)
      expect(latest?.source).toBe('deterministic')
      const hist = await listHandtestHistory({ repoInput: '/tmp/app', limit: 10 }, root)
      expect(hist.filter((e) => e.key === first.key)).toHaveLength(1)

      const { deleteHandtestHistory } = await import('../src/report-store.js')
      const del = await deleteHandtestHistory(first.id, root)
      expect(del.deleted).toBe(true)
      expect(await loadHandtestReport('/tmp/app', 'aaa', 'bbb', root)).toBeNull()
      expect(await listHandtestHistory({ repoInput: '/tmp/app', limit: 10 }, root)).toHaveLength(0)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('issue tracker fail feedback', () => {
  it('builds subject and description from failed items', async () => {
    const {
      buildFailFeedbackDescription,
      buildFailFeedbackSubject,
      collectFailedItems,
      isTrackerConfigReady,
    } = await import('../src/issue-tracker.js')
    const report = {
      repoPath: '/tmp/app',
      baseCommit: 'aaa',
      headCommit: 'bbb',
      generatedAt: '2026-01-01T00:00:00.000Z',
      modelEnriched: false,
      changedFiles: [],
      direct: [
        {
          id: '1',
          displayName: '登录',
          kind: 'direct' as const,
          risk: 'high' as const,
          files: ['Login.kt'],
          evidence: [],
          suggestedSteps: ['打开登录'],
          status: 'fail' as const,
          testerNote: '按钮无响应',
        },
      ],
      ripple: [],
    }
    const failed = collectFailedItems(report)
    expect(failed).toHaveLength(1)
    expect(buildFailFeedbackSubject(failed, 'app')).toContain('登录')
    expect(
      buildFailFeedbackDescription({
        repoPath: '/tmp/app',
        baseCommit: 'aaa',
        headCommit: 'bbb',
        items: failed,
      }),
    ).toContain('按钮无响应')
    const withShots = buildFailFeedbackDescription({
      repoPath: '/tmp/app',
      baseCommit: 'aaa',
      headCommit: 'bbb',
      items: [
        {
          ...failed[0]!,
          testerScreenshots: [
            {
              id: 's1',
              name: 'login-fail.jpg',
              mime: 'image/jpeg',
              dataUrl: 'data:image/jpeg;base64,aaa',
            },
          ],
        },
        {
          id: '2',
          displayName: '支付',
          kind: 'direct',
          risk: 'medium',
          files: [],
          evidence: [],
          suggestedSteps: [],
          status: 'fail',
          testerNote: '超时',
        },
      ],
    })
    expect(withShots).toContain('### 1. 登录')
    expect(withShots).toContain('login-fail.jpg')
    // Screenshot must sit under the first item, before the second item heading.
    const shotAt = withShots.indexOf('![login-fail.jpg]')
    const secondAt = withShots.indexOf('### 2. 支付')
    expect(shotAt).toBeGreaterThan(0)
    expect(secondAt).toBeGreaterThan(shotAt)
    expect(withShots).not.toContain('## 截图附件')
    const withEmbeds = buildFailFeedbackDescription({
      repoPath: '/tmp/app',
      baseCommit: 'aaa',
      headCommit: 'bbb',
      embedScreenshotDataUrls: false,
      items: [
        {
          ...failed[0]!,
          testerScreenshots: [
            {
              id: 's1',
              name: 'login-fail.jpg',
              mime: 'image/jpeg',
              dataUrl: 'data:image/jpeg;base64,aaa',
            },
          ],
        },
      ],
      screenshotEmbeds: {
        '0:0': '![login-fail.jpg](https://example.com/embed/xxx)',
      },
    })
    expect(withEmbeds).toContain('![login-fail.jpg](https://example.com/embed/xxx)')
    expect(withEmbeds.indexOf('![login-fail.jpg]')).toBeLessThan(withEmbeds.indexOf('---'))
    expect(
      isTrackerConfigReady({
        provider: 'github',
        github: { token: 't', owner: 'o', repo: 'r' },
      }),
    ).toBe(true)
    expect(
      isTrackerConfigReady({
        provider: 'yunxiao',
        yunxiao: {
          endpoint: 'https://openapi-rdc.aliyuncs.com',
          token: 'pt-x',
          organizationId: 'org',
          spaceId: 'space',
          workitemTypeId: 'bug',
          assignedTo: 'u1',
        },
      }),
    ).toBe(true)
  })

  it('parses yunxiao organization list from API payload', async () => {
    const { listYunxiaoOrganizations } = await import('../src/yunxiao.js')
    const fetchImpl = async () =>
      ({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify([
            { id: 'org-1', name: 'Acme' },
            { id: 'org-2', name: 'Beta' },
          ]),
      }) as Response
    const result = await listYunxiaoOrganizations(
      'https://openapi-rdc.aliyuncs.com',
      'pt-test',
      fetchImpl as typeof fetch,
    )
    expect(result.ok).toBe(true)
    expect(result.options).toEqual([
      { id: 'org-1', name: 'Acme' },
      { id: 'org-2', name: 'Beta' },
    ])
  })

  it('lists yunxiao work items with category filter', async () => {
    const { listYunxiaoWorkitems } = await import('../src/yunxiao.js')
    const fetchImpl = async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || '{}')) as { category?: string }
      expect(body.category).toContain('Req')
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            result: [
              { id: 'w1', subject: '需求 A', category: 'Req' },
              { id: 'w2', subject: '缺陷 B', category: 'Bug' },
            ],
          }),
      } as Response
    }
    const result = await listYunxiaoWorkitems(
      'https://openapi-rdc.aliyuncs.com',
      'pt-test',
      'org-1',
      'space-1',
      ['Req', 'Bug'],
      fetchImpl as typeof fetch,
    )
    expect(result.ok).toBe(true)
    expect(result.items).toHaveLength(2)
    expect(result.items[0]?.subject).toBe('需求 A')
  })
})

describe('report attachments', () => {
  it('normalizes attachment metadata and rejects path traversal', async () => {
    const { normalizeReportAttachments } = await import('../src/attachments.js')
    const list = normalizeReportAttachments([
      {
        id: 'a1',
        name: 'demo.mp4',
        mime: 'video/mp4',
        size: 1024,
        storedName: 'a1.mp4',
        addedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'bad',
        name: 'x',
        storedName: '../escape.bin',
        size: 1,
      },
    ])
    expect(list).toHaveLength(1)
    expect(list[0]?.name).toBe('demo.mp4')
  })
})

describe('scope item ids', () => {
  it('dedupes colliding checklist ids', async () => {
    const { ensureUniqueScopeItemIds } = await import('../src/scope-ids.js')
    const report = ensureUniqueScopeItemIds({
      repoPath: '/tmp/app',
      baseCommit: 'a',
      headCommit: 'b',
      generatedAt: '2026-01-01T00:00:00.000Z',
      modelEnriched: false,
      changedFiles: [],
      direct: [
        {
          id: 'same',
          displayName: 'A',
          kind: 'direct',
          risk: 'low',
          files: [],
          evidence: [],
          suggestedSteps: [],
          status: 'pending',
        },
        {
          id: 'same',
          displayName: 'B',
          kind: 'direct',
          risk: 'low',
          files: [],
          evidence: [],
          suggestedSteps: [],
          status: 'pending',
        },
      ],
      ripple: [
        {
          id: '',
          displayName: 'C',
          kind: 'ripple',
          risk: 'low',
          files: [],
          evidence: [],
          suggestedSteps: [],
          status: 'pending',
        },
      ],
    })
    const ids = [...report.direct, ...report.ripple].map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.every(Boolean)).toBe(true)
  })
})

describe('agile work item merge', () => {
  it('seeds direct checklist items from selected work items', async () => {
    const { mergeAgileWorkItemsIntoReport, parseAgileWorkItemRefs } = await import(
      '../src/agile-workitems.js'
    )
    const related = parseAgileWorkItemRefs([
      { id: '1001', subject: '支付改版', category: 'Req', description: '覆盖退款' },
      { id: '1002', subject: '登录崩溃', category: 'Bug' },
    ])
    const report = mergeAgileWorkItemsIntoReport(
      {
        repoPath: '/tmp/app',
        baseCommit: 'a',
        headCommit: 'b',
        generatedAt: '2026-01-01T00:00:00.000Z',
        modelEnriched: false,
        changedFiles: ['Pay.kt'],
        direct: [
          {
            id: 'direct:pay',
            displayName: '支付页',
            kind: 'direct',
            risk: 'medium',
            files: ['Pay.kt'],
            evidence: [],
            suggestedSteps: ['打开支付'],
            status: 'pending',
          },
        ],
        ripple: [],
      },
      related,
    )
    expect(report.direct.some((i) => i.displayName.includes('支付改版'))).toBe(true)
    expect(report.direct.some((i) => i.displayName.includes('登录崩溃'))).toBe(true)
    expect(report.direct.some((i) => i.displayName === '支付页')).toBe(true)
  })
})
