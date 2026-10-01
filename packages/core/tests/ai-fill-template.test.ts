import { describe, expect, it } from 'vitest'
import {
  applyVisualRenderPatches,
  collectDynamicRegionCatalog,
} from '../src/design/apply-visual-render-patches.js'
import { parseVisualRenderPatches } from '../src/visual-findings-publish.js'
import { buildCodeVisualPrompt } from '../src/chat-prompt.js'
import type { RenderPatchableNode } from '../src/design/apply-visual-render-patches.js'

function frame(
  id: string,
  partial: Partial<RenderPatchableNode> & { children?: RenderPatchableNode[] },
): RenderPatchableNode {
  return {
    id,
    name: partial.name ?? id,
    kind: partial.kind ?? 'frame',
    x: partial.x ?? 0,
    y: partial.y ?? 0,
    width: partial.width ?? 100,
    height: partial.height ?? 100,
    dynamic: partial.dynamic,
    style: partial.style ?? {},
    children: partial.children ?? [],
    inferredChildren: partial.inferredChildren,
  }
}

describe('applyVisualRenderPatches', () => {
  it('fills a dynamic region and marks aiInferred', () => {
    const root = frame('root', {
      width: 390,
      height: 800,
      children: [
        frame('list', {
          name: 'RecyclerView',
          kind: 'dynamic',
          dynamic: true,
          x: 0,
          y: 200,
          width: 390,
          height: 400,
        }),
      ],
    })
    const { root: next, applied, unmatched } = applyVisualRenderPatches(root, [
      {
        targetNodeId: 'list',
        nodes: [
          {
            kind: 'view',
            rx: 8,
            ry: 8,
            width: 374,
            height: 64,
            style: { backgroundColor: '#ffffff', borderRadius: 8 },
          },
          {
            kind: 'text',
            text: '会员中心',
            rx: 24,
            ry: 28,
            width: 120,
            height: 20,
            style: { fontSize: 16, color: '#111111' },
          },
        ],
      },
    ])
    expect(applied).toBe(1)
    expect(unmatched).toEqual([])
    const list = next.children[0]!
    expect(list.aiInferred).toBe(true)
    expect(list.inferredChildren).toHaveLength(2)
    expect(list.inferredChildren![0]!.style?.backgroundColor).toBe('#ffffff')
    expect(list.inferredChildren![1]!.text).toBe('会员中心')
    expect(list.inferredChildren![1]!.x).toBe(24)
    expect(list.inferredChildren![1]!.y).toBe(228)
  })

  it('matches by targetLabel when id misses', () => {
    const root = frame('root', {
      children: [frame('rv_main', { name: 'RecyclerView', dynamic: true, kind: 'dynamic' })],
    })
    const { applied } = applyVisualRenderPatches(root, [
      {
        targetNodeId: 'unknown',
        targetLabel: 'RecyclerView',
        nodes: [{ kind: 'text', text: 'A', rx: 0, ry: 0, width: 40, height: 16 }],
      },
    ])
    expect(applied).toBe(1)
  })
})

describe('parseVisualRenderPatches chrome nodes', () => {
  it('accepts view-only card chrome without text', () => {
    const patches = parseVisualRenderPatches([
      {
        targetNodeId: 'list',
        nodes: [
          {
            kind: 'view',
            rx: 0,
            ry: 0,
            width: 100,
            height: 40,
            style: { backgroundColor: '#fff' },
          },
        ],
      },
    ])
    expect(patches).toHaveLength(1)
    expect(patches[0]!.nodes[0]!.kind).toBe('view')
  })
})

describe('collectDynamicRegionCatalog + prompt', () => {
  it('lists dynamic regions for the AI prompt', () => {
    const root = frame('root', {
      children: [
        frame('list', {
          name: 'list',
          dynamic: true,
          kind: 'dynamic',
          width: 390,
          height: 200,
          inferredChildren: [frame('t0', { kind: 'text', text: 'x' })],
        }),
      ],
    })
    const catalog = collectDynamicRegionCatalog(root)
    expect(catalog).toEqual([
      {
        id: 'list',
        name: 'list',
        width: 390,
        height: 200,
        filled: true,
        itemRendered: false,
      },
    ])
    const prompt = buildCodeVisualPrompt({
      designName: 'Home',
      figmaUrl: 'https://example',
      repoPath: '/tmp',
      codeRelativePath: 'res/layout/home.xml',
      dependencyManifest: '(none)',
      dynamicRegionsCatalog: JSON.stringify(catalog),
      jobId: 'job-1',
    })
    expect(prompt).toContain('差异清单')
    expect(prompt).toContain('"id":"list"')
    expect(prompt).not.toContain('renderPatch')
  })
})
