import { describe, expect, it } from 'vitest'
import {
  applyCrashListQuery,
  parseCrashListQuery,
  resolveCrashTimeWindow,
  resolveUmengDateRange,
  splitCrashFilterTokens,
} from '../src/crash/index.js'
import type { CrashIncident } from '../src/crash/types.js'

const rows: CrashIncident[] = [
  {
    id: '1',
    title: 'a',
    provider: 'umeng',
    stackText: 'x',
    osVersion: '17.5',
    deviceModel: 'iPhone 15',
    lastSeenAt: '2026-10-08T12:00:00.000Z',
  },
  {
    id: '2',
    title: 'b',
    provider: 'umeng',
    stackText: 'x',
    osVersion: '14',
    deviceModel: 'Pixel 7',
    lastSeenAt: '2026-10-01T12:00:00.000Z',
  },
  {
    id: '3',
    title: 'c',
    provider: 'umeng',
    stackText: 'x',
    osVersion: '18.0',
    deviceModel: 'iPhone 16',
    lastSeenAt: '2026-09-01T12:00:00.000Z',
  },
]

describe('crash list query filters', () => {
  it('splits multi-value tokens', () => {
    expect(splitCrashFilterTokens('17, 18；iPhone')).toEqual(['17', '18', 'iPhone'])
  })

  it('ANDs osVersions with deviceModels; ORs within each field', () => {
    const filtered = applyCrashListQuery(rows, {
      osVersions: ['17', '18'],
      deviceModels: ['iPhone'],
    })
    expect(filtered.map((r) => r.id).sort()).toEqual(['1', '3'])
  })

  it('keeps rows that omit OS/device metadata when those filters are set', () => {
    const sparse: CrashIncident[] = [
      { id: 's1', title: 'sparse', provider: 'umeng', stackText: 'x' },
      rows[1]!,
    ]
    const filtered = applyCrashListQuery(sparse, {
      osVersions: ['17'],
      deviceModels: ['iPhone'],
    })
    expect(filtered.map((r) => r.id)).toEqual(['s1'])
  })

  it('parses body fields including custom dates', () => {
    const q = parseCrashListQuery({
      osVersions: '17,18',
      deviceModels: 'iPhone, Pixel',
      startAt: '2026-10-01',
      endAt: '2026-10-10',
      timeRange: 'custom',
    })
    expect(q.osVersions).toEqual(['17', '18'])
    expect(q.deviceModels).toEqual(['iPhone', 'Pixel'])
    expect(q.startAt).toBe('2026-10-01')
    expect(q.timeRange).toBe('custom')
  })

  it('keeps Umeng device ids with commas intact when sent as arrays', () => {
    const q = parseCrashListQuery({
      deviceModels: ['iPhone17,4', 'iPhone17,3', 'iPhone18,1'],
      osVersions: ['ios 26.6.2', 'ios 26.7'],
      appVersions: ['3.26.8', '3.26.9'],
    })
    expect(q.deviceModels).toEqual(['iPhone17,4', 'iPhone17,3', 'iPhone18,1'])
    expect(q.osVersions).toEqual(['ios 26.6.2', 'ios 26.7'])
    expect(q.appVersions).toEqual(['3.26.8', '3.26.9'])
  })

  it('filters by custom date window', () => {
    const filtered = applyCrashListQuery(rows, {
      startAt: '2026-10-01',
      endAt: '2026-10-08',
    })
    expect(filtered.map((r) => r.id).sort()).toEqual(['1', '2'])
  })

  it('resolveUmengDateRange uses freeDays for custom bounds', () => {
    const range = resolveUmengDateRange({
      timeRange: 'custom',
      startAt: '2026-09-01',
      endAt: '2026-09-15',
    })
    expect(range.dateType).toBe('freeDays')
    expect(range.startDay.startsWith('20260901')).toBe(true)
    expect(range.endDay.startsWith('20260915')).toBe(true)
  })

  it('resolveUmengDateRange keeps last7Days when preset also has display dates', () => {
    const range = resolveUmengDateRange({
      timeRange: '7d',
      startAt: '2026-10-04',
      endAt: '2026-10-10',
    })
    expect(range.dateType).toBe('last7Days')
  })

  it('resolveUmengDateRange maps 24h/30d/90d to SPA tokens', () => {
    expect(resolveUmengDateRange({ timeRange: '24h' }).dateType).toBe('today')
    expect(resolveUmengDateRange({ timeRange: '30d' }).dateType).toBe('last30Days')
    expect(resolveUmengDateRange({ timeRange: '90d' }).dateType).toBe('last90Days')
  })

  it('resolveCrashTimeWindow maps 7d preset', () => {
    const now = new Date('2026-10-10T12:00:00.000Z')
    const w = resolveCrashTimeWindow({ timeRange: '7d' }, now)
    expect(w.startMs).toBe(now.getTime() - 7 * 24 * 3600 * 1000)
    expect(w.endMs).toBe(now.getTime())
  })
})
