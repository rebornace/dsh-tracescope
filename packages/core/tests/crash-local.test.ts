// packages/core/tests/crash-local.test.ts
import { describe, expect, it } from 'vitest'
import { getCrashProvider, localCrashProvider } from '../src/crash/index.js'

describe('localCrashProvider', () => {
  it('is ready when stack text present', () => {
    expect(localCrashProvider.isReady({ provider: 'local', stackText: 'java.lang.NPE' })).toBe(true)
    expect(localCrashProvider.isReady({ provider: 'local' })).toBe(false)
  })

  it('get returns incident from pasted stack', async () => {
    const stack = 'java.lang.NullPointerException: boom\n\tat com.foo.Bar.baz(Bar.kt:42)'
    const cfg = { provider: 'local' as const, stackText: stack, title: 'NPE in Bar' }
    const incident = await localCrashProvider.get(cfg, 'local')
    expect(incident.stackText).toContain('NullPointerException')
    expect(incident.title).toMatch(/NPE|NullPointer/)
    expect(getCrashProvider('local')?.id).toBe('local')
  })

  it('list returns one summary when stack text present, else empty', async () => {
    const stack = 'java.lang.NullPointerException: boom'
    const withStack = { provider: 'local' as const, stackText: stack, title: 'NPE' }
    const listed = await localCrashProvider.list(withStack)
    expect(listed).toHaveLength(1)
    expect(listed[0]?.id).toBe('local')
    expect(listed[0]?.title).toBe('NPE')
    expect(await localCrashProvider.list({ provider: 'local' })).toEqual([])
  })

  it('capabilities exposes detail support without filters', () => {
    expect(localCrashProvider.capabilities()).toEqual({ filters: [], supportsDetail: true })
  })

  it('list is empty when provider is not local', async () => {
    const listed = await localCrashProvider.list({
      provider: 'umeng',
      stackText: 'java.lang.NullPointerException: boom',
    })
    expect(listed).toEqual([])
  })
})
