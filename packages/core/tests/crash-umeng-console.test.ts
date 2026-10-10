import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getCrashProvider } from '../src/crash/index.js'
import { applyCrashListQuery, parseCrashListQuery } from '../src/crash/list-query.js'
import {
  UmengCrashError,
  assertUmengEnvelopeCode,
  clearUmengListCacheForTests,
  mapUmengDetailResponse,
  mapUmengListIncidents,
  mapUmengListResponse,
  fetchUmengFilterOptions,
  omitEmptyUmengFields,
  umengCrashProvider,
  umengFilterArray,
  umengMetaTypeForQuery,
  UMENG_CONSOLE_DEVICES_PATH,
  UMENG_CONSOLE_METAOS_PATH,
  UMENG_CONSOLE_VERSIONS_PATH,
} from '../src/crash/providers/umeng-console.js'

const here = dirname(fileURLToPath(import.meta.url))
const listFx = JSON.parse(
  readFileSync(join(here, 'fixtures/umeng/list.json'), 'utf8'),
) as unknown
const detailFx = JSON.parse(
  readFileSync(join(here, 'fixtures/umeng/detail.json'), 'utf8'),
) as unknown

const baseCfg = {
  provider: 'umeng' as const,
  appKey: 'synthetic-app-key-demo',
  cookie: 'session=demo; ctoken=demo-csrf-token',
}

describe('mapUmengListResponse / mapUmengDetailResponse', () => {
  it('maps list fixture to CrashIncident summaries', () => {
    const items = mapUmengListResponse(listFx)
    expect(items.length).toBeGreaterThan(0)
    expect(items[0]?.id).toBeTruthy()
    expect(items[0]?.errorKind).toBe('crash')
    expect(items[0]?.provider).toBe('umeng')
  })

  it('throws on non-success envelope code', () => {
    expect(() => mapUmengListResponse({ code: 401, data: { list: [] } })).toThrow(UmengCrashError)
  })

  it('maps permission envelope to UMENG_FORBIDDEN', () => {
    try {
      assertUmengEnvelopeCode({ code: 403, msg: '您还没有该操作的权限' })
      expect.fail('expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(UmengCrashError)
      expect((err as UmengCrashError).code).toBe('UMENG_FORBIDDEN')
    }
    try {
      assertUmengEnvelopeCode({ code: 500, msg: '您还没有该操作的权限' })
      expect.fail('expected throw')
    } catch (err) {
      expect((err as UmengCrashError).code).toBe('UMENG_FORBIDDEN')
    }
  })

  it('omitEmptyUmengFields drops blank strings', () => {
    expect(
      omitEmptyUmengFields({
        a: 'x',
        b: '',
        c: '  ',
        d: 0,
        e: false,
        f: null,
      }),
    ).toEqual({ a: 'x', d: 0, e: false })
  })

  it('maps detail fixture to full stack', () => {
    const incident = mapUmengDetailResponse(detailFx)
    expect(incident.stackText.length).toBeGreaterThan(20)
    expect(incident.id).toBe('umeng-fixture-crash-001')
    expect(incident.exceptionName).toContain('NullPointerException')
  })

  it('maps live-style numeric errorType / os without throwing', () => {
    const incident = mapUmengDetailResponse({
      code: 200,
      data: {
        errorId: '11732449537190',
        summary: 'CPP\n0  CoreFoundation',
        errorType: 1,
        os: 2,
        happenTimes: 3,
        affectUsers: 2,
        stackTrace:
          'NSInvalidArgumentException\n0  CoreFoundation  0x0 ___exceptionPreprocess + 0',
      },
    })
    expect(incident.id).toBe('11732449537190')
    expect(incident.stackText).toContain('NSInvalidArgumentException')
    expect(incident.count).toBe(3)
  })
})

describe('umengCrashProvider', () => {
  afterEach(() => {
    clearUmengListCacheForTests()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('registers in crash registry', () => {
    expect(getCrashProvider('umeng')?.id).toBe('umeng')
  })

  it('is ready when appKey and cookie present for umeng provider', () => {
    expect(umengCrashProvider.isReady(baseCfg)).toBe(true)
    expect(umengCrashProvider.isReady({ provider: 'umeng', appKey: 'k' })).toBe(false)
    expect(umengCrashProvider.isReady({ provider: 'local', appKey: 'k', cookie: 'c' })).toBe(
      false,
    )
  })

  it('list/get use mock fetch against allowlisted host', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      expect(url).toMatch(/apm\.umeng\.com/)
      expect(String(init?.method ?? 'GET').toUpperCase()).toBe('POST')
      if (url.includes('errorDetail') || url.includes('errorlog') || url.includes('errorStack')) {
        return new Response(JSON.stringify(detailFx), { status: 200 })
      }
      return new Response(JSON.stringify(listFx), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const listed = await umengCrashProvider.list(baseCfg)
    expect(listed.items.length).toBe(2)
    expect(listed.page).toBe(1)
    expect(listed.items[0]?.id).toBe('umeng-fixture-crash-001')

    const incident = await umengCrashProvider.get(baseCfg, 'umeng-fixture-crash-001')
    expect(incident.stackText).toContain('CheckoutViewModel.kt')
    expect(fetchMock).toHaveBeenCalled()
  })

  it('throws UMENG_AUTH on HTTP 401', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('Unauthorized', { status: 401 })),
    )
    await expect(umengCrashProvider.list(baseCfg)).rejects.toMatchObject({
      code: 'UMENG_AUTH',
    })
    await expect(umengCrashProvider.get(baseCfg, 'x')).rejects.toBeInstanceOf(UmengCrashError)
  })

  it('rejects non-allowlisted hosts', async () => {
    await expect(
      umengCrashProvider.list({
        ...baseCfg,
        consoleBaseUrl: 'https://evil.example.com',
      }),
    ).rejects.toMatchObject({ code: 'UMENG_HOST_DENIED' })
  })

  it('openapi transport is explicitly unsupported', async () => {
    await expect(
      umengCrashProvider.list({ ...baseCfg, transport: 'openapi' }),
    ).rejects.toMatchObject({ code: 'UMENG_OPENAPI_UNSUPPORTED' })
  })

  it('sends errorType / errorAbstract to Umeng instead of re-filtering locally', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
      expect(body.errorType).toBe('anr')
      expect(body.errorAbstract).toBe('NullPointer')
      return new Response(JSON.stringify(listFx), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const listed = await umengCrashProvider.list(baseCfg, {
      errorKinds: ['anr'],
      keyword: 'NullPointer',
    })
    // Fixture still has both rows — server filter is trusted; no local wipe.
    expect(listed.items.length).toBeGreaterThanOrEqual(1)
    expect(fetchMock).toHaveBeenCalled()
  })

  it('list passes page to console API', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { page?: number; pageSize?: number }
      expect(body.page).toBe(2)
      expect(body.pageSize).toBe(20)
      return new Response(
        JSON.stringify({
          code: 200,
          data: { list: (listFx as { data: { list: unknown[] } }).data.list, total: 90, page: 2 },
        }),
        { status: 200 },
      )
    })
    vi.stubGlobal('fetch', fetchMock)
    const listed = await umengCrashProvider.list(baseCfg, { page: 2, pageSize: 20 })
    expect(listed.page).toBe(2)
    expect(listed.total).toBe(90)
    expect(listed.hasMore).toBe(true)
  })

  it('umengFilterArray drops empty / all-sentinel tokens', () => {
    expect(umengFilterArray(['3.26.0', ' 3.27.0 '])).toEqual(['3.26.0', '3.27.0'])
    expect(umengFilterArray([''])).toBeUndefined()
    expect(umengFilterArray([])).toBeUndefined()
  })

  it('umengFilterArray caps each dimension at 10 values (SPA limit)', () => {
    const many = Array.from({ length: 15 }, (_, i) => `v${i}`)
    expect(umengFilterArray(many)).toEqual(many.slice(0, 10))
  })

  it('list does not drop Umeng rows via local time/keyword re-filter', async () => {
    const staleList = {
      code: 200,
      data: {
        total: 1,
        page: 1,
        pageSize: 20,
        list: [
          {
            errorId: 'old-row',
            errorTitle: 'stale title without needle',
            errorType: 'crash',
            // Far outside a 7d window — must still surface (server already filtered).
            lastHappenTime: '2020-01-01T00:00:00.000Z',
            happenTimes: 9,
          },
        ],
      },
    }
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(staleList), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const listed = await umengCrashProvider.list(baseCfg, {
      timeRange: '7d',
      keyword: 'needle-only-on-server',
      page: 1,
      pageSize: 20,
    })
    expect(listed.items).toHaveLength(1)
    expect(listed.items[0]?.id).toBe('old-row')
    expect(listed.total).toBe(1)
  })

  it('umengMetaTypeForQuery maps single errorKinds', () => {
    expect(umengMetaTypeForQuery(['anr'])).toBe('anr')
    expect(umengMetaTypeForQuery(['error'])).toBe('exception')
    expect(umengMetaTypeForQuery(['crash', 'anr'])).toBe('crash')
    expect(umengMetaTypeForQuery(undefined)).toBe('crash')
  })

  it('fetchUmengFilterOptions maps SPA meta APIs', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes(UMENG_CONSOLE_VERSIONS_PATH)) {
        return new Response(JSON.stringify({ code: 200, data: ['3.26.0', '-1'] }), { status: 200 })
      }
      if (url.includes(UMENG_CONSOLE_DEVICES_PATH)) {
        return new Response(
          JSON.stringify({
            code: 200,
            data: [{ device: 'iPhone14,5', deviceName: 'iPhone 13' }],
          }),
          { status: 200 },
        )
      }
      if (url.includes(UMENG_CONSOLE_METAOS_PATH)) {
        return new Response(JSON.stringify({ code: 200, data: ['17.0', '18.0'] }), { status: 200 })
      }
      return new Response(JSON.stringify({ code: 500, msg: 'unexpected' }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const opts = await fetchUmengFilterOptions(baseCfg, { metaType: 'crash' })
    expect(opts.versions).toEqual([
      { value: '3.26.0', label: '3.26.0' },
      { value: '-1', label: '未知版本' },
    ])
    expect(opts.devices).toEqual([{ value: 'iPhone14,5', label: 'iPhone 13' }])
    expect(opts.osVersions.map((o) => o.value)).toEqual(['17.0', '18.0'])
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('list body sends version/os/device as SPA arrays', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
      expect(body.dateType).toBe('last7Days')
      expect(body.orderBy).toBe('happenTimes')
      expect(body.order).toBe('desc')
      expect(body.errorType).toBe('crash')
      expect(body.dataSourceId).toBe('synthetic-app-key-demo')
      expect(body.version).toEqual(['3.26.8', '3.26.9'])
      expect(body.os).toEqual(['ios 26.6.2', 'ios 26.7'])
      // Device hardware ids contain commas — must not be split into ["iPhone17","4"].
      expect(body.device).toEqual(['iPhone17,3', 'iPhone17,4'])
      expect(body).not.toHaveProperty('osVersions')
      expect(body).not.toHaveProperty('deviceModels')
      expect(body).not.toHaveProperty('appVersions')
      expect(body).not.toHaveProperty('onlyNew')
      expect(init?.redirect).toBe('manual')
      return new Response(JSON.stringify(listFx), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    // Simulate Host parseCrashListQuery → provider.list (ids must stay atomic).
    const query = parseCrashListQuery({
      timeRange: '7d',
      startAt: '2026-10-04',
      endAt: '2026-10-10',
      appVersions: ['3.26.8', '3.26.9'],
      osVersions: ['ios 26.6.2', 'ios 26.7'],
      deviceModels: ['iPhone17,4', 'iPhone17,3'],
      sort: { field: 'count', direction: 'desc' },
      page: 1,
      pageSize: 20,
    })
    await umengCrashProvider.list(baseCfg, query)
    expect(fetchMock).toHaveBeenCalled()
  })

  it('treats redirect responses as auth failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response('', {
          status: 302,
          headers: { location: 'https://passport.umeng.com/login' },
        }),
      ),
    )
    await expect(umengCrashProvider.list(baseCfg, { timeRange: '7d' })).rejects.toMatchObject({
      code: 'UMENG_AUTH',
    })
  })

  it('sorts by count descending by default via lastSeen when no sort', () => {
    const incidents = mapUmengListIncidents(listFx)
    const sorted = applyCrashListQuery(incidents, { sort: { field: 'count', direction: 'desc' } })
    expect(sorted[0]?.count).toBe(42)
  })

  it('probe succeeds on lightweight list fetch', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(listFx), { status: 200 })),
    )
    const probe = (
      umengCrashProvider as {
        probe?: (c: typeof baseCfg) => Promise<{ ok: boolean; error?: string }>
      }
    ).probe
    expect(probe).toBeTypeOf('function')
    const result = await probe!(baseCfg)
    expect(result.ok).toBe(true)
  })

  it('list works without ctoken (CSRF optional)', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(init?.method ?? 'GET').toUpperCase()).toBe('POST')
      expect(String(input)).toContain('/hsf/analysis/errorList')
      const headers = init?.headers as Record<string, string>
      expect(headers['x-csrf-token']).toBeUndefined()
      return new Response(JSON.stringify(listFx), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const listed = await umengCrashProvider.list({
      provider: 'umeng',
      appKey: 'synthetic-app-key-demo',
      cookie: 'EGG_SESS=demo-session-only',
    })
    expect(listed.items.length).toBe(2)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
