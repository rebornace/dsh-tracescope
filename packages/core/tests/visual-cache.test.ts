import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  loadVisualHifi,
  loadVisualRematch,
  loadVisualScan,
  saveVisualHifi,
  saveVisualRematch,
  saveVisualScan,
  visualHifiKey,
  visualRematchKey,
  visualScanKey,
} from '../src/visual-cache.js'
import { buildCodeVisualPrompt } from '../src/chat-prompt.js'

describe('visual cache keys', () => {
  it('normalizes path separators and case so keys are stable', () => {
    const a = visualScanKey('C:\\Repo\\App', 'FILE_KEY')
    const b = visualScanKey('c:/repo/app', 'file_key')
    expect(a).toBe(b)
  })

  it('produces distinct keys when inputs differ', () => {
    const a = visualScanKey('repo-a', 'file')
    const b = visualScanKey('repo-b', 'file')
    expect(a).not.toBe(b)

    const k1 = visualHifiKey('repo', 'file', '1-2', 'a.xml')
    const k2 = visualHifiKey('repo', 'file', '1-3', 'a.xml')
    expect(k1).not.toBe(k2)
  })
})

describe('visual cache persistence', () => {
  const roots: string[] = []
  async function tempRoot(): Promise<string> {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'tracescope-vc-'))
    roots.push(dir)
    return dir
  }

  afterEach(async () => {
    for (const dir of roots) await rm(dir, { recursive: true, force: true })
    roots.length = 0
  })

  it('returns null for an uncached scan/hifi entry', async () => {
    const root = await tempRoot()
    expect(await loadVisualScan('missing', root)).toBeNull()
    expect(await loadVisualHifi('missing', root)).toBeNull()
  })

  it('round-trips a scan payload and records savedAt', async () => {
    const root = await tempRoot()
    const key = visualScanKey('repo', 'file')
    const payload = { totals: { pages: 3, matched: 1, weak: 1, none: 1 }, pages: [] }
    await saveVisualScan(key, payload, root)
    const loaded = await loadVisualScan<typeof payload>(key, root)
    expect(loaded?.payload).toEqual(payload)
    expect(typeof loaded?.savedAt).toBe('string')
    // File is written under the scan subdirectory.
    const raw = JSON.parse(await readFile(path.join(root, 'visual-cache', 'scan', `${key}.json`), 'utf8'))
    expect(raw.key).toBe(key)
  })

  it('round-trips a hifi payload independently of scan', async () => {
    const root = await tempRoot()
    const key = visualHifiKey('repo', 'file', '1-2', 'res/layout/a.xml')
    const payload = { viewport: { width: 390, height: 844 } }
    await saveVisualHifi(key, payload, root)
    const loaded = await loadVisualHifi<typeof payload>(key, root)
    expect(loaded?.payload).toEqual(payload)
    expect(await loadVisualScan(key, root)).toBeNull()
  })

  it('round-trips AI rematch picks independently of scan', async () => {
    const root = await tempRoot()
    const key = visualRematchKey('repo', 'file', '1:2')
    const payload = {
      designId: '1:2',
      picks: [{ adapterId: 'android-xml', relativePath: 'res/layout/home.xml', score: 0.9 }],
    }
    await saveVisualRematch(key, payload, root)
    const loaded = await loadVisualRematch<typeof payload>(key, root)
    expect(loaded?.payload).toEqual(payload)
    expect(await loadVisualScan(key, root)).toBeNull()
  })

  it('ignores a corrupt cache file instead of throwing', async () => {
    const root = await tempRoot()
    const { mkdir, writeFile } = await import('node:fs/promises')
    const dir = path.join(root, 'visual-cache', 'scan')
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, 'bad.json'), 'not-json', 'utf8')
    expect(await loadVisualScan('bad', root)).toBeNull()
  })
})

describe('buildCodeVisualPrompt', () => {
  it('is a slim skill brief with reading list, not a pasted design tree', () => {
    const manifest = [
      '- 入口布局：',
      '  - res/layout/home.xml',
      '- 通过 <include> 引入的布局：',
      '  - res/layout/item_header.xml',
      '- 引用的 drawable（含位图与 shape/selector）：',
      '  - res/drawable/bg_card.xml',
    ].join('\n')
    const prompt = buildCodeVisualPrompt({
      designName: '首页',
      figmaUrl: 'https://www.figma.com/design/abc/file?node-id=1-2',
      designImageUrl: 'https://example/design.png',
      designSnapshot: '- [1:2] frame Home\n  - [1:3] text 标题',
      repoPath: 'C:/repo/app',
      platformLabel: 'Android XML',
      codeRelativePath: 'res/layout/home.xml',
      dependencyManifest: manifest,
      jobId: 'job-123',
    })
    expect(prompt).toContain('tracescope-ui-review')
    expect(prompt).toContain('job-123')
    expect(prompt).toContain('C:/repo/app')
    expect(prompt).toContain('res/layout/home.xml')
    expect(prompt).toContain('item_header.xml')
    expect(prompt).toContain('bg_card.xml')
    expect(prompt).toContain('https://example/design.png')
    expect(prompt).toContain('tracescope_get_design_snapshot')
    expect(prompt).toContain('tracescope_publish_visual_findings')
    expect(prompt).toContain('不要访问 figma.com')
    expect(prompt).not.toContain('figma.com/design')
    // Design tree must NOT be dumped into the starter prompt.
    expect(prompt).not.toContain('[1:2] frame Home')
    expect(prompt).not.toContain('设计树快照')
  })
})
