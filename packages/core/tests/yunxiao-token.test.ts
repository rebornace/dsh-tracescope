import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  loadRememberedYunxiaoAccess,
  loadTrackerConfig,
  rememberYunxiaoAccess,
  saveTrackerConfig,
} from '../src/tracker-store.js'

describe('remembered yunxiao access token', () => {
  const dirs: string[] = []

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  async function tempRoot(): Promise<string> {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'tracescope-yx-'))
    dirs.push(dir)
    return dir
  }

  it('keeps the token across a masked rewrite and a restart-style reload', async () => {
    const root = await tempRoot()
    await rememberYunxiaoAccess({ token: 'pt-saved', endpoint: 'https://openapi-rdc.aliyuncs.com' }, root)
    await rememberYunxiaoAccess({ token: '••••••••', organizationId: '' }, root)
    const loaded = await loadRememberedYunxiaoAccess(root)
    expect(loaded.token).toBe('pt-saved')
  })

  it('does not turn defect tracking on just because a repo token was saved', async () => {
    const root = await tempRoot()
    await rememberYunxiaoAccess({ token: 'pt-repo' }, root)
    const tracker = await loadTrackerConfig(root)
    expect(tracker.provider).toBe('none')
    expect((await loadRememberedYunxiaoAccess(root)).token).toBe('pt-repo')
  })

  it('mirrors the token into an existing yunxiao defect config', async () => {
    const root = await tempRoot()
    await saveTrackerConfig(
      {
        provider: 'yunxiao',
        yunxiao: {
          endpoint: 'https://openapi-rdc.aliyuncs.com',
          token: 'pt-old',
          organizationId: 'org',
          spaceId: 'space',
          workitemTypeId: 'bug',
          assignedTo: 'me',
        },
      },
      root,
    )
    await rememberYunxiaoAccess({ token: 'pt-new' }, root)
    const tracker = await loadTrackerConfig(root)
    expect(tracker.yunxiao?.token).toBe('pt-new')
    expect(tracker.yunxiao?.spaceId).toBe('space')
  })
})
