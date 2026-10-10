import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  crashRepoKey,
  loadCrashConfig,
  publicCrashConfig,
  resolveCrashConfigFromBody,
  saveCrashConfig,
} from '../src/crash/store.js'
import { resetPathsForTests, setDataRootOverride } from '../src/paths.js'

describe('crash credential store', () => {
  let dataRoot = ''

  afterEach(() => {
    setDataRootOverride(null)
    resetPathsForTests()
  })

  async function setupRoot(): Promise<void> {
    dataRoot = await mkdtemp(join(tmpdir(), 'crash-store-'))
    setDataRootOverride(dataRoot)
  }

  it('saveCrashConfig clearCookie removes cookie from disk', async () => {
    await setupRoot()
    await saveCrashConfig(
      { provider: 'umeng', appKey: 'ak1', cookie: 'secret-cookie-value' },
      { remember: true },
    )
    let loaded = await loadCrashConfig()
    expect(loaded.cookie).toBe('secret-cookie-value')

    await saveCrashConfig(
      { provider: 'umeng', appKey: 'ak1', cookie: undefined },
      { remember: true, clearCookie: true },
    )
    loaded = await loadCrashConfig()
    expect(loaded.cookie).toBeUndefined()
    expect(publicCrashConfig(loaded).hasCookie).toBe(false)

    const raw = JSON.parse(await readFile(join(dataRoot, 'crash-credentials.json'), 'utf8')) as {
      global?: { cookie?: string }
    }
    expect(raw.global?.cookie).toBeUndefined()
  })

  it('repo clearCookie does not fall back to global cookie', async () => {
    await setupRoot()
    const repo = join(dataRoot, 'my-repo')
    await saveCrashConfig(
      { provider: 'umeng', appKey: 'global-ak', cookie: 'global-secret' },
      { remember: true },
    )
    await saveCrashConfig(
      { provider: 'umeng', appKey: 'repo-ak', cookie: 'repo-secret' },
      { remember: true, repoPath: repo },
    )
    let loaded = await loadCrashConfig(repo)
    expect(loaded.cookie).toBe('repo-secret')
    // Repo save mirrors credentials into global (latest remembered wins).
    expect((await loadCrashConfig()).cookie).toBe('repo-secret')

    await saveCrashConfig(
      { provider: 'umeng', appKey: 'repo-ak', cookie: undefined },
      { remember: true, repoPath: repo, clearCookie: true },
    )
    loaded = await loadCrashConfig(repo)
    expect(loaded.cookie).toBeUndefined()
    expect(publicCrashConfig(loaded).hasCookie).toBe(false)

    // Clearing repo cookie must not wipe the mirrored global cookie.
    const globalOnly = await loadCrashConfig()
    expect(globalOnly.cookie).toBe('repo-secret')
  })

  it('masked cookie in save does not wipe stored secret without clearCookie', async () => {
    await setupRoot()
    await saveCrashConfig(
      { provider: 'umeng', appKey: 'ak1', cookie: 'keep-me' },
      { remember: true },
    )
    await saveCrashConfig(
      { provider: 'umeng', appKey: 'ak1', cookie: '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022' },
      { remember: true },
    )
    const loaded = await loadCrashConfig()
    expect(loaded.cookie).toBe('keep-me')
  })

  it('remote repo URL keys are stable and mirror credentials to global', async () => {
    await setupRoot()
    const remote = 'https://codeup.aliyun.com/org/group/CPP_iOS.git'
    expect(crashRepoKey(remote)).toBe(remote.toLowerCase())
    expect(crashRepoKey(remote)).not.toMatch(/^[a-z]:\\/i)

    await saveCrashConfig(
      { provider: 'umeng', appKey: 'ios-ak', cookie: 'umeng-cookie-secret' },
      { remember: true, repoPath: remote },
    )
    const viaRemote = await loadCrashConfig(remote)
    expect(viaRemote.appKey).toBe('ios-ak')
    expect(viaRemote.cookie).toBe('umeng-cookie-secret')

    const viaGlobal = await loadCrashConfig()
    expect(viaGlobal.appKey).toBe('ios-ak')
    expect(viaGlobal.cookie).toBe('umeng-cookie-secret')

    // Different local path still inherits mirrored global credentials.
    const viaOther = await loadCrashConfig(join(dataRoot, 'some-other-clone'))
    expect(viaOther.appKey).toBe('ios-ak')
    expect(viaOther.cookie).toBe('umeng-cookie-secret')
  })

  it('resolveCrashConfigFromBody restores cookie when client sends masked bullets', async () => {
    await setupRoot()
    const remote = 'https://codeup.aliyun.com/org/group/CPP_iOS.git'
    await saveCrashConfig(
      { provider: 'umeng', appKey: 'ios-ak', cookie: 'real-session-cookie' },
      { remember: true, repoPath: remote },
    )
    const resolved = await resolveCrashConfigFromBody({
      repoPath: remote,
      provider: 'umeng',
      appKey: 'ios-ak',
      cookie: '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022',
      id: '11732449537190',
    })
    expect(resolved.cookie).toBe('real-session-cookie')
    expect(publicCrashConfig(resolved).cookie).toBe('\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022')
    expect(publicCrashConfig(resolved).hasCookie).toBe(true)
  })
})
