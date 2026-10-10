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
})
