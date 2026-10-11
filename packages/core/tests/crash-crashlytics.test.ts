import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getCrashProvider } from '../src/crash/index.js'
import {
  CrashlyticsError,
  buildCrashlyticsReportQuery,
  clearCrashlyticsCachesForTests,
  crashlyticsAppParent,
  crashlyticsCrashProvider,
  crashlyticsErrorTypes,
  crashlyticsProjectRef,
  formatCrashlyticsEventStack,
  mapCrashlyticsErrorType,
  mapCrashlyticsTopIssuesReport,
  projectNumberFromAppId,
  setCrashlyticsFetchForTests,
  setGcloudAccessTokenForTests,
} from '../src/crash/providers/crashlytics.js'

const here = dirname(fileURLToPath(import.meta.url))
const topIssuesFx = JSON.parse(
  readFileSync(join(here, 'fixtures/crashlytics/top-issues.json'), 'utf8'),
) as unknown
const issueFx = JSON.parse(
  readFileSync(join(here, 'fixtures/crashlytics/issue.json'), 'utf8'),
) as unknown
const eventFx = JSON.parse(
  readFileSync(join(here, 'fixtures/crashlytics/event.json'), 'utf8'),
) as unknown

const baseCfg = {
  provider: 'crashlytics' as const,
  projectId: 'demo-project',
  appId: '1:1234567890:android:abcdef',
  accessToken: 'ya29.test-token',
}

describe('crashlytics mappers', () => {
  it('maps topIssues report to summaries', () => {
    const mapped = mapCrashlyticsTopIssuesReport(topIssuesFx, baseCfg.appId)
    expect(mapped.items).toHaveLength(2)
    expect(mapped.items[0]?.id).toBe('crashlytics-issue-001')
    expect(mapped.items[0]?.provider).toBe('crashlytics')
    expect(mapped.items[0]?.errorKind).toBe('crash')
    expect(mapped.items[0]?.count).toBe(42)
    expect(mapped.items[1]?.errorKind).toBe('anr')
    expect(mapped.total).toBe(2)
  })

  it('formats event stack from exceptions', () => {
    const event = (eventFx as { events: unknown[] }).events[0] as Parameters<
      typeof formatCrashlyticsEventStack
    >[0]
    const stack = formatCrashlyticsEventStack(event)
    expect(stack).toContain('java.lang.NullPointerException')
    expect(stack).toContain('MainActivity.onCreate')
    expect(stack).toContain('MainActivity.java:42')
  })

  it('maps error types and builds report query filters', () => {
    expect(mapCrashlyticsErrorType('FATAL')).toBe('crash')
    expect(crashlyticsErrorTypes(['crash', 'anr'])).toEqual(['FATAL', 'ANR'])
    const qs = buildCrashlyticsReportQuery(
      {
        timeRange: '7d',
        appVersions: ['1.2.3 (123)'],
        errorKinds: ['crash'],
        statuses: ['open'],
        keyword: 'NullPointer',
      },
      20,
    )
    expect(qs).toContain('page_size=20')
    expect(qs).toContain('pageSize=20')
    expect(qs).toContain('filter.version.displayNames=1.2.3')
    expect(qs).toContain('filter.issue.errorTypes=FATAL')
    expect(qs).toContain('filter.issue.states=OPEN')
    expect(qs).toContain('filter.issue.content=NullPointer')
    expect(qs).toContain('filter.interval.startTime=')
  })

  it('prefers project number from App ID in parent path', () => {
    expect(projectNumberFromAppId(baseCfg.appId)).toBe('1234567890')
    expect(crashlyticsProjectRef(baseCfg)).toBe('1234567890')
    expect(crashlyticsAppParent(baseCfg)).toBe(
      'projects/1234567890/apps/1:1234567890:android:abcdef',
    )
    // Explicit numeric projectId wins over App ID number
    expect(
      crashlyticsAppParent({
        ...baseCfg,
        projectId: '9999999999',
      }),
    ).toBe('projects/9999999999/apps/1:1234567890:android:abcdef')
  })
})

describe('crashlyticsCrashProvider', () => {
  afterEach(() => {
    clearCrashlyticsCachesForTests()
    setCrashlyticsFetchForTests(null)
    setGcloudAccessTokenForTests(null)
    vi.restoreAllMocks()
  })

  beforeEach(() => {
    // Avoid picking up a real gcloud session on the developer machine.
    setGcloudAccessTokenForTests(() => null)
  })

  it('registers in crash registry', () => {
    expect(getCrashProvider('crashlytics')?.id).toBe('crashlytics')
  })

  it('is ready with access token or service account json', () => {
    expect(crashlyticsCrashProvider.isReady(baseCfg)).toBe(true)
    expect(
      crashlyticsCrashProvider.isReady({
        provider: 'crashlytics',
        projectId: 'p',
        appId: '1:1:android:x',
      }),
    ).toBe(false)
    expect(
      crashlyticsCrashProvider.isReady({
        provider: 'crashlytics',
        projectId: 'p',
        appId: '1:1:android:x',
        serviceAccountJson: JSON.stringify({
          client_email: 'sa@demo.iam.gserviceaccount.com',
          private_key: 'not-a-real-key',
        }),
      }),
    ).toBe(true)
  })

  it('lists via topIssues and gets detail via issue + event', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/reports/topIssues')) {
        return new Response(JSON.stringify(topIssuesFx), { status: 200 })
      }
      if (url.includes('/issues/crashlytics-issue-001') && !url.includes('events')) {
        return new Response(JSON.stringify(issueFx), { status: 200 })
      }
      if (url.includes('events:batchGet') || url.includes('/events?')) {
        return new Response(JSON.stringify(eventFx), { status: 200 })
      }
      return new Response(JSON.stringify({ error: { message: `unexpected ${url}` } }), {
        status: 500,
      })
    })
    setCrashlyticsFetchForTests(fetchMock as unknown as typeof fetch)

    const list = await crashlyticsCrashProvider.list(baseCfg, { page: 1, pageSize: 20 })
    expect(list.items[0]?.id).toBe('crashlytics-issue-001')
    expect(list.total).toBe(2)

    const detail = await crashlyticsCrashProvider.get(baseCfg, 'crashlytics-issue-001')
    expect(detail.provider).toBe('crashlytics')
    expect(detail.stackText).toContain('NullPointerException')
    expect(detail.appVersion).toBe('1.2.3')
    expect(detail.deviceModel).toContain('Pixel 8')
  })

  it('maps 401 to CRASHLYTICS_AUTH', async () => {
    setCrashlyticsFetchForTests(
      (async () => new Response(JSON.stringify({ error: { message: 'invalid' } }), { status: 401 })) as typeof fetch,
    )
    await expect(crashlyticsCrashProvider.list(baseCfg, { page: 1 })).rejects.toMatchObject({
      code: 'CRASHLYTICS_AUTH',
    } satisfies Partial<CrashlyticsError>)
  })

  it('maps entity 404 + listReports miss to missing app hint', async () => {
    setCrashlyticsFetchForTests(
      (async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/reports/topIssues')) {
          return new Response(
            JSON.stringify({
              error: { code: 404, message: 'Requested entity was not found.', status: 'NOT_FOUND' },
            }),
            { status: 404 },
          )
        }
        if (url.endsWith('/reports') || url.includes('/reports?')) {
          return new Response(JSON.stringify({ reports: [] }), { status: 200 })
        }
        return new Response(JSON.stringify({ error: { message: `unexpected ${url}` } }), {
          status: 500,
        })
      }) as typeof fetch,
    )
    await expect(crashlyticsCrashProvider.list(baseCfg, { page: 1 })).rejects.toMatchObject({
      code: 'CRASHLYTICS_NOT_FOUND',
      message: expect.stringContaining('找不到 Firebase 项目或 App'),
    })
  })

  it('treats topIssues 404 as empty when listReports still lists topIssues', async () => {
    setCrashlyticsFetchForTests(
      (async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/reports/topIssues')) {
          return new Response(
            JSON.stringify({
              error: { code: 404, message: 'Requested entity was not found.', status: 'NOT_FOUND' },
            }),
            { status: 404 },
          )
        }
        if (url.includes('/reports') && !url.includes('/reports/')) {
          return new Response(
            JSON.stringify({
              reports: [
                {
                  name: 'projects/1234567890/apps/1:1234567890:android:abcdef/reports/topIssues',
                  displayName: 'Top Issues',
                },
              ],
            }),
            { status: 200 },
          )
        }
        return new Response(JSON.stringify({ error: { message: `unexpected ${url}` } }), {
          status: 500,
        })
      }) as typeof fetch,
    )
    const list = await crashlyticsCrashProvider.list(baseCfg, { page: 1 })
    expect(list.items).toEqual([])
    expect(list.total).toBe(0)
  })

  it('sends x-goog-user-project for user access tokens', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const headers = new Headers(init?.headers)
      expect(headers.get('x-goog-user-project')).toBe('demo-project')
      if (url.includes('/reports/topIssues')) {
        return new Response(JSON.stringify({ groups: [], totalSize: 0 }), { status: 200 })
      }
      return new Response(JSON.stringify({ error: { message: `unexpected ${url}` } }), {
        status: 500,
      })
    })
    setCrashlyticsFetchForTests(fetchMock as unknown as typeof fetch)
    await crashlyticsCrashProvider.list(baseCfg, { page: 1 })
    expect(fetchMock).toHaveBeenCalled()
  })

  it('retries with gcloud token after pasted accessToken 401', async () => {
    setGcloudAccessTokenForTests(() => null)
    let calls = 0
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      calls += 1
      if (calls === 1) {
        // Force resolve to use pasted token first by keeping gcloud null initially,
        // then enable gcloud for the retry path inside crashlyticsGet.
        setGcloudAccessTokenForTests(() => 'ya29.gcloud-refreshed-token')
        return new Response(JSON.stringify({ error: { message: 'invalid' } }), { status: 401 })
      }
      const headers = new Headers(init?.headers)
      expect(headers.get('Authorization')).toBe('Bearer ya29.gcloud-refreshed-token')
      expect(headers.get('x-goog-user-project')).toBe('demo-project')
      if (url.includes('/reports/topIssues')) {
        return new Response(JSON.stringify({ groups: [], totalSize: 0 }), { status: 200 })
      }
      return new Response(JSON.stringify({ error: { message: `unexpected ${url}` } }), {
        status: 500,
      })
    })
    setCrashlyticsFetchForTests(fetchMock as unknown as typeof fetch)
    const list = await crashlyticsCrashProvider.list(baseCfg, { page: 1 })
    expect(list.items).toEqual([])
    expect(calls).toBeGreaterThanOrEqual(2)
  })

  it('prefers live gcloud token over pasted accessToken', async () => {
    setGcloudAccessTokenForTests(() => 'ya29.from-gcloud')
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      expect(headers.get('Authorization')).toBe('Bearer ya29.from-gcloud')
      return new Response(JSON.stringify({ groups: [], totalSize: 0 }), { status: 200 })
    })
    setCrashlyticsFetchForTests(fetchMock as unknown as typeof fetch)
    await crashlyticsCrashProvider.list(baseCfg, { page: 1 })
    expect(fetchMock).toHaveBeenCalled()
  })

  it('maps quota-project 403 to a clear hint', async () => {
    setCrashlyticsFetchForTests(
      (async () =>
        new Response(
          JSON.stringify({
            error: {
              code: 403,
              message:
                'Your application is authenticating by using local Application Default Credentials. The firebasecrashlytics.googleapis.com API requires a quota project',
              status: 'PERMISSION_DENIED',
            },
          }),
          { status: 403 },
        )) as typeof fetch,
    )
    await expect(crashlyticsCrashProvider.list(baseCfg, { page: 1 })).rejects.toMatchObject({
      code: 'CRASHLYTICS_FORBIDDEN',
      message: expect.stringContaining('配额项目'),
    })
  })

  it('maps Method not found 404 to access-token guidance', async () => {
    setCrashlyticsFetchForTests(
      (async () =>
        new Response(
          JSON.stringify({ error: { code: 404, message: 'Method not found.', status: 'NOT_FOUND' } }),
          { status: 404 },
        )) as typeof fetch,
    )
    await expect(crashlyticsCrashProvider.list(baseCfg, { page: 1 })).rejects.toMatchObject({
      code: 'CRASHLYTICS_AUTH',
      message: expect.stringContaining('服务账号'),
    })
  })
})
