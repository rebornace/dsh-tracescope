import { describe, expect, it } from 'vitest'
import {
  expandFocusedDesignPages,
  looksLikeScreenFrame,
  type DesignDoc,
  type DesignNode,
} from '../src/index.js'

function box(x: number, y: number, width: number, height: number) {
  return { x, y, width, height }
}

function frame(
  id: string,
  name: string,
  b: ReturnType<typeof box>,
  children: DesignNode[] = [],
): DesignNode {
  return {
    id,
    name,
    kind: 'frame',
    box: b,
    style: {},
    children,
  }
}

function text(id: string, value: string): DesignNode {
  return {
    id,
    name: value,
    kind: 'text',
    text: value,
    box: box(0, 0, 40, 16),
    style: {},
    children: [],
  }
}

describe('expandFocusedDesignPages', () => {
  it('keeps a single screen as one page', () => {
    const design: DesignDoc = {
      scale: 1,
      source: 'figma',
      root: frame('1:1', 'Home', box(0, 0, 390, 844), [
        text('1:2', '标题'),
        text('1:3', '副标题'),
      ]),
    }
    const pages = expandFocusedDesignPages(design)
    expect(pages).toHaveLength(1)
    expect(pages[0]!.summary.id).toBe('1:1')
    expect(pages[0]!.doc.root.id).toBe('1:1')
  })

  it('splits a parent frame with multiple screen children', () => {
    const a = frame('2:1', '登录', box(0, 0, 390, 844), [
      text('2:11', '登录'),
      text('2:12', '手机号'),
      text('2:13', '验证码'),
      text('2:14', '提交'),
    ])
    const b = frame('2:2', '首页', box(420, 0, 390, 844), [
      text('2:21', '首页'),
      text('2:22', '推荐'),
      text('2:23', '我的'),
      text('2:24', '设置'),
    ])
    const design: DesignDoc = {
      scale: 1,
      source: 'figma',
      root: frame('2:0', '多页容器', box(0, 0, 900, 900), [a, b]),
    }
    expect(looksLikeScreenFrame(a)).toBe(true)
    expect(looksLikeScreenFrame(b)).toBe(true)
    const pages = expandFocusedDesignPages(design)
    expect(pages).toHaveLength(2)
    expect(pages.map((p) => p.summary.id)).toEqual(['2:1', '2:2'])
    expect(pages.map((p) => p.summary.name)).toEqual(['登录', '首页'])
    // Each child is rebased so its origin is (0,0) for isolated render.
    expect(pages[0]!.doc.root.box.x).toBe(0)
    expect(pages[0]!.doc.root.box.y).toBe(0)
    expect(pages[1]!.doc.root.box.x).toBe(0)
    expect(pages[1]!.doc.root.box.y).toBe(0)
  })

  it('splits nested screens under a section/group wrapper', () => {
    const a = frame('3:1', 'A', box(10, 10, 375, 812), [
      text('3:11', 'A1'),
      text('3:12', 'A2'),
      text('3:13', 'A3'),
      text('3:14', 'A4'),
    ])
    const b = frame('3:2', 'B', box(400, 10, 375, 812), [
      text('3:21', 'B1'),
      text('3:22', 'B2'),
      text('3:23', 'B3'),
      text('3:24', 'B4'),
    ])
    const folder: DesignNode = {
      id: '3:g',
      name: 'Folder',
      kind: 'group',
      box: box(0, 0, 800, 850),
      style: {},
      children: [a, b],
    }
    const design: DesignDoc = {
      scale: 1,
      source: 'figma',
      root: frame('3:0', 'Section', box(0, 0, 800, 850), [folder]),
    }
    const pages = expandFocusedDesignPages(design)
    expect(pages).toHaveLength(2)
    expect(pages.map((p) => p.summary.id)).toEqual(['3:1', '3:2'])
  })
})
