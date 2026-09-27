import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  changeDataRoot,
  dataRootSync,
  defaultDataRoot,
  directorySize,
  envDataRoot,
  pointerFilePath,
  resetPathsForTests,
  resolveDataRoot,
  setDataRootOverride,
  setHomedirForTests,
} from '../src/paths.js'

describe('data root resolution', () => {
  const dirs: string[] = []
  let prevEnv: string | undefined

  beforeEach(async () => {
    prevEnv = process.env.TRACESCOPE_HOME
    resetPathsForTests()
    const home = await mkdtemp(path.join(os.tmpdir(), 'tracescope-home-'))
    dirs.push(home)
    setHomedirForTests(home)
  })

  afterEach(async () => {
    if (prevEnv === undefined) delete process.env.TRACESCOPE_HOME
    else process.env.TRACESCOPE_HOME = prevEnv
    resetPathsForTests()
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  async function tempDir(prefix: string): Promise<string> {
    const dir = await mkdtemp(path.join(os.tmpdir(), prefix))
    dirs.push(dir)
    return dir
  }

  it('defaults to <home>/.tracescope', async () => {
    const home = defaultDataRoot().replace(/[\\/]\.tracescope$/, '')
    expect(await resolveDataRoot()).toBe(path.join(home, '.tracescope'))
  })

  it('prefers an explicit cacheRoot argument', async () => {
    const explicit = await tempDir('tracescope-explicit-')
    setDataRootOverride(await tempDir('tracescope-mem-'))
    expect(await resolveDataRoot(explicit)).toBe(path.resolve(explicit))
    expect(dataRootSync(explicit)).toBe(path.resolve(explicit))
  })

  it('honors the in-memory override', async () => {
    const mem = await tempDir('tracescope-mem-')
    setDataRootOverride(mem)
    expect(await resolveDataRoot()).toBe(path.resolve(mem))
    expect(dataRootSync()).toBe(path.resolve(mem))
  })

  it('honors TRACESCOPE_HOME env before the default', async () => {
    const env = await tempDir('tracescope-env-')
    process.env.TRACESCOPE_HOME = env
    expect(envDataRoot()).toBe(path.resolve(env))
    expect(await resolveDataRoot()).toBe(path.resolve(env))
    expect(dataRootSync()).toBe(path.resolve(env))
  })

  it('reads a pointer file and persists it across a fresh resolution', async () => {
    const home = path.dirname(defaultDataRoot())
    const target = await tempDir('tracescope-ptr-target-')
    await changeDataRoot(target)
    // Simulate a new process: clear all in-memory state, then re-point home.
    resetPathsForTests()
    setHomedirForTests(home)
    expect(await resolveDataRoot()).toBe(path.resolve(target))
    const pointer = JSON.parse(await readFile(pointerFilePath(), 'utf8'))
    expect(pointer.dataRoot).toBe(path.resolve(target))
  })

  it('migrates existing contents, writes pointer and removes the old root', async () => {
    const home = path.dirname(defaultDataRoot())
    const oldRoot = defaultDataRoot()
    await mkdir(path.join(oldRoot, 'reports', 'history'), { recursive: true })
    await writeFile(path.join(oldRoot, 'reports', 'a.json'), '{"x":1}')
    await writeFile(path.join(oldRoot, 'reports', 'history', 'h.json'), '{"h":2}')

    const next = await tempDir('tracescope-newroot-')
    const result = await changeDataRoot(next)

    expect(result.migrated).toBe(true)
    expect(result.dataRoot).toBe(path.resolve(next))
    // Contents copied.
    expect(await readFile(path.join(next, 'reports', 'a.json'), 'utf8')).toBe('{"x":1}')
    expect(await readFile(path.join(next, 'reports', 'history', 'h.json'), 'utf8')).toBe('{"h":2}')
    // Old root removed.
    await expect(readFile(path.join(oldRoot, 'reports', 'a.json'), 'utf8')).rejects.toThrow()
    // Pointer points at the new root.
    const pointer = JSON.parse(await readFile(path.join(home, '.tracescope.root.json'), 'utf8'))
    expect(pointer.dataRoot).toBe(path.resolve(next))
  })

  it('removes the pointer when reset to the default root', async () => {
    const next = await tempDir('tracescope-newroot-')
    await changeDataRoot(next)
    await changeDataRoot(defaultDataRoot())
    await expect(readFile(pointerFilePath(), 'utf8')).rejects.toThrow()
    expect(await resolveDataRoot()).toBe(defaultDataRoot())
  })

  it('rejects an empty data root', async () => {
    await expect(changeDataRoot('   ')).rejects.toThrow(/不能为空/)
  })

  it('reports recursive directory size', async () => {
    const root = await tempDir('tracescope-size-')
    await mkdir(path.join(root, 'sub'), { recursive: true })
    await writeFile(path.join(root, 'a.txt'), 'hello') // 5
    await writeFile(path.join(root, 'sub', 'b.txt'), 'world!') // 6
    expect(await directorySize(root)).toBe(11)
    expect(await directorySize(path.join(root, 'missing'))).toBe(0)
  })
})
