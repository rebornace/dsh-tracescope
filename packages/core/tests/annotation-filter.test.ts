import { describe, expect, it } from 'vitest'
import {
  isDesignerAnnotationText,
  pruneDesignerAnnotations,
  parseVisualRenderPatches,
} from '../src/index.js'
import type { DesignDoc } from '../src/index.js'

function docWith(texts: string[]): DesignDoc {
  return {
    scale: 1,
    source: 'figma',
    root: {
      id: 'root',
      name: 'screen',
      kind: 'frame',
      box: { x: 0, y: 0, width: 390, height: 844 },
      style: {},
      children: texts.map((text, i) => ({
        id: `t${i}`,
        name: 'label',
        kind: 'text',
        text,
        box: { x: 0, y: i * 20, width: 100, height: 18 },
        style: {},
        children: [],
      })),
    },
  }
}

describe('isDesignerAnnotationText', () => {
  it('keeps real count UI labels (they are shipped UI, not notes)', () => {
    expect(isDesignerAnnotationText('图 1000')).toBe(false)
    expect(isDesignerAnnotationText('文 20')).toBe(false)
    expect(isDesignerAnnotationText('展品 500')).toBe(false)
    expect(isDesignerAnnotationText('文章12')).toBe(false)
  })

  it('flags placeholder filler with 2+ repeated particles', () => {
    expect(isDesignerAnnotationText('文章标题啊')).toBe(false)
    expect(isDesignerAnnotationText('文章标题啊啊')).toBe(true)
    expect(isDesignerAnnotationText('文章引言或正文啊啊啊噢噢噢噢2222')).toBe(true)
  })

  it('flags explicit placeholder markers', () => {
    expect(isDesignerAnnotationText('占位')).toBe(true)
    expect(isDesignerAnnotationText('placeholder')).toBe(true)
  })

  it('keeps normal sentences that end in a particle but lack filler runs', () => {
    expect(isDesignerAnnotationText('好啊')).toBe(false)
    expect(isDesignerAnnotationText('快走啊')).toBe(false)
  })

  it('keeps real UI copy', () => {
    expect(isDesignerAnnotationText('跳过')).toBe(false)
    expect(isDesignerAnnotationText('订阅粮坑')).toBe(false)
    expect(isDesignerAnnotationText('换一批')).toBe(false)
    expect(isDesignerAnnotationText('没有感兴趣的粮坑？搜索一下吧~')).toBe(false)
  })
  it('flags measurement and spec-prefix callouts', () => {
    expect(isDesignerAnnotationText('16px')).toBe(true)
    expect(isDesignerAnnotationText('← 12')).toBe(true)
    expect(isDesignerAnnotationText('备注：这里给开发看')).toBe(true)
    expect(isDesignerAnnotationText('间距：8')).toBe(true)
    expect(isDesignerAnnotationText('字号：14')).toBe(true)
  })
})

describe('pruneDesignerAnnotations', () => {
  it('removes only placeholder filler, keeps real counts', () => {
    const doc = docWith(['跳过', '图 1000', '正文啊啊啊噢噢', '换一批'])
    const removed = pruneDesignerAnnotations(doc)
    expect(removed).toBe(1)
    expect(doc.root.children.map((c) => c.text)).toEqual([
      '跳过',
      '图 1000',
      '换一批',
    ])
  })

  it('prunes annotation-named groups wholesale', () => {
    const doc: DesignDoc = {
      scale: 1,
      source: 'figma',
      root: {
        id: 'root',
        name: 'screen',
        kind: 'frame',
        box: { x: 0, y: 0, width: 390, height: 844 },
        style: {},
        children: [
          {
            id: 'notes',
            name: '开发备注',
            kind: 'group',
            box: { x: 0, y: 0, width: 100, height: 40 },
            style: {},
            children: [
              {
                id: 'n1',
                name: 't',
                kind: 'text',
                text: '给开发看的说明',
                box: { x: 0, y: 0, width: 100, height: 20 },
                style: {},
                children: [],
              },
            ],
          },
          {
            id: 'ui',
            name: '标题',
            kind: 'text',
            text: '订阅粮坑',
            box: { x: 0, y: 50, width: 100, height: 20 },
            style: {},
            children: [],
          },
        ],
      },
    }
    const removed = pruneDesignerAnnotations(doc)
    expect(removed).toBe(1)
    expect(doc.root.children.map((c) => c.id)).toEqual(['ui'])
  })
})

describe('parseVisualRenderPatches', () => {
  it('parses well-formed patches', () => {
    const patches = parseVisualRenderPatches([
      {
        targetNodeId: 'recycler',
        nodes: [
          { kind: 'text', text: '推荐订阅', rx: 16, ry: 10, width: 100, height: 18 },
        ],
      },
    ])
    expect(patches).toHaveLength(1)
    expect(patches[0]!.nodes[0]!.text).toBe('推荐订阅')
  })

  it('drops nodes missing required content and clamps coords', () => {
    const patches = parseVisualRenderPatches([
      {
        targetNodeId: 'recycler',
        nodes: [
          { kind: 'text', rx: 0, ry: 0, width: 10, height: 10 },
          { kind: 'image', rx: 0, ry: 0, width: 40, height: 40 },
          { kind: 'text', text: 'x', rx: 999999, ry: 0, width: 20, height: 16 },
        ],
      },
    ])
    const nodes = patches[0]!.nodes
    expect(nodes).toHaveLength(1)
    expect(nodes[0]!.rx).toBeLessThanOrEqual(2000)
  })

  it('throws when input is not an array', () => {
    expect(() => parseVisualRenderPatches({})).toThrow()
  })
})
