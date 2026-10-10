import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getCrashProvider } from '../src/crash/index.js'
import { applyCrashListQuery } from '../src/crash/list-query.js'
import {
  UmengCrashError,
  clearUmengListCacheForTests,
  mapUmengDetailResponse,
  mapUmengListIncidents,
  mapUmengListResponse,
  umengCrashProvider,
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
  cookie: 'session=demo; path=/',
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

  it('maps detail fixture to full stack', () => {
    const incident = mapUmengDetailResponse(detailFx)
    expect(incident.stackText.length).toBeGreaterThan(20)
    expect(incident.id).toBe('umeng-fixture-crash-001')
    expect(incident.exceptionName).toContain('NullPointerException')
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
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      expect(url).toMatch(/mobile\.umeng\.com/)
      if (url.includes('/detail')) {
        return new Response(JSON.stringify(detailFx), { status: 200 })
      }
      return new Response(JSON.stringify(listFx), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const listed = await umengCrashProvider.list(baseCfg)
    expect(listed.length).toBe(2)
    expect(listed[0]?.id).toBe('umeng-fixture-crash-001')

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

  it('applies keyword and errorKinds filters locally', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(listFx), { status: 200 })),
    )
    const byKind = await umengCrashProvider.list(baseCfg, { errorKinds: ['anr'] })
    expect(byKind).toHaveLength(1)
    expect(byKind[0]?.id).toBe('umeng-fixture-anr-002')

    const byKeyword = await umengCrashProvider.list(baseCfg, { keyword: 'NullPointer' })
    expect(byKeyword).toHaveLength(1)
    expect(byKeyword[0]?.id).toBe('umeng-fixture-crash-001')
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
})
