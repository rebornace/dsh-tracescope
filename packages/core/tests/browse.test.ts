import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  browseRoot,
  listDirectories,
  listVolumes,
  quickPlaces,
} from '../src/browse.js'

describe('filesystem browsing', () => {
  const dirs: string[] = []

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  async function tempRoot(): Promise<string> {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'tracescope-browse-'))
    dirs.push(dir)
    return dir
  }

  it('lists only subfolders, sorted, ignoring files and dotfolders', async () => {
    const root = await tempRoot()
    await mkdir(path.join(root, 'zeta'))
    await mkdir(path.join(root, 'alpha'))
    await mkdir(path.join(root, '.hidden'))
    await writeFile(path.join(root, 'note.txt'), 'x')

    const result = await listDirectories(root)
    expect(result.path).toBe(path.resolve(root))
    expect(result.isRoot).toBe(false)
    expect(result.dirs.map((d) => d.name)).toEqual(['alpha', 'zeta'])
    expect(result.dirs[0].path).toBe(path.join(path.resolve(root), 'alpha'))
  })

  it('resolves a relative target and reports a parent', async () => {
    const root = await tempRoot()
    const child = path.join(root, 'child')
    await mkdir(child)
    const result = await listDirectories(child)
    expect(result.parent).toBe(path.resolve(root))
  })

  it('errors clearly on an unreadable path', async () => {
    await expect(listDirectories(path.join(os.tmpdir(), 'tracescope-does-not-exist-xyz'))).rejects.toThrow(
      /无法读取目录/,
    )
  })

  it('provides quick places rooted at the home directory', () => {
    const places = quickPlaces()
    expect(places.map((p) => p.name)).toContain('主目录')
    expect(places[0].path).toBe(os.homedir())
  })

  it.runIf(process.platform === 'win32')('enumerates windows volumes', async () => {
    const volumes = await listVolumes()
    expect(volumes.length).toBeGreaterThan(0)
    expect(volumes).toContain('C:\\')
    const root = await browseRoot()
    expect(root.isRoot).toBe(true)
    expect(root.parent).toBeNull()
    expect(root.dirs.map((d) => d.path)).toContain('C:\\')
  })

  it.runIf(process.platform !== 'win32')('uses / on posix', async () => {
    expect(await listVolumes()).toEqual(['/'])
    const root = await browseRoot()
    expect(root.isRoot).toBe(false)
    expect(root.path).toBe('/')
  })
})
