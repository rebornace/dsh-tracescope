import { describe, expect, it } from 'vitest'
import {
  detectSubPages,
  subPageAsDoc,
} from '../src/design/subpages.js'
import type { DesignDoc, DesignNode } from '../src/design/types.js'

function textNode(id: string, text: string): DesignNode {
  return { id, name: text, kind: 'text', text, box: {}, style: {}, children: [] }
}

function view(id: string, name: string, children: DesignNode[]): DesignNode {
  return { id, name, kind: 'view', box: {}, style: {}, children }
}

function frameNode(id: string, name: string, children: DesignNode[]): DesignNode {
  return { id, name, kind: 'frame', box: {}, style: {}, children }
}

function designDoc(root: DesignNode): DesignDoc {
  return { root, scale: 1, source: 'figma' }
}

function iconNode(id: string): DesignNode {
  return { id, name: 'icon', kind: 'icon', box: {}, style: {}, children: [] }
}

/** Build a card row with a fixed shape and the given texts. */
function row(id: string, texts: string[]): DesignNode {
  const content = texts.map((t, i) => textNode(id + '-t' + i, t))
  return view(
    id,
    'row',
    [frameNode(id + '-f', 'inner', [...content, iconNode(id + '-ic')])],
  )
}

/** Card with a different structural shape (extra image) so signatures differ. */
function cardWithImage(id: string, name: string, texts: string[]): DesignNode {
  const inner = frameNode(
    id + '-f',
    'inner',
    texts.map((t, i) => textNode(id + '-t' + i, t)),
  )
  const image: DesignNode = {
    id: id + '-img',
    name: 'avatar',
    kind: 'image',
    box: {},
    style: {},
    children: [],
  }
  return view(id, name, [image, inner])
}

describe('detectSubPages - repeated list', () => {
  it('detects children sharing a structural shape as a repeated item', () => {
    const doc = designDoc(
      frameNode('screen', 'Feed', [
        row('r1', ['标题A', '副标题A']),
        row('r2', ['标题B', '副标题B']),
        row('r3', ['标题C', '副标题C']),
      ]),
    )
    const subs = detectSubPages(doc)
    expect(subs).toHaveLength(1)
    expect(subs[0]!.reason).toBe('repeated-item')
  })

  it('returns nothing for a single screen with fewer than two children', () => {
    const doc = designDoc(frameNode('screen', 'Login', [row('r1', ['登录'])]))
    expect(detectSubPages(doc)).toHaveLength(0)
  })
})

describe('detectSubPages - variant board', () => {
  it('treats distinct multi-text cards as card variants', () => {
    const doc = designDoc(
      frameNode('screen', 'Board', [
        row('a', ['总热度', '28764', '连载中']),
        cardWithImage('b', '作者卡', ['作者', '大仙儿', '1分钟前']),
      ]),
    )
    const subs = detectSubPages(doc)
    const variants = subs.filter((s) => s.reason === 'card-variant')
    expect(variants).toHaveLength(2)
  })

  it('does not treat a lone single-text button as a card variant', () => {
    // 5-node button (passes node threshold) but only one text (fails card texts).
    const button: DesignNode = {
      id: 'btn',
      name: '关注',
      kind: 'view',
      box: {},
      style: {},
      children: [
        {
          id: 'btn-f',
          name: 'inner',
          kind: 'frame',
          box: {},
          style: {},
          children: [
            textNode('btn-t', '关注'),
            iconNode('btn-ic'),
            { id: 'btn-s', name: 'bg', kind: 'shape', box: {}, style: {}, children: [] },
          ],
        },
      ],
    }
    const doc = designDoc(frameNode('screen', 'Board', [button, row('b', ['作者', '大仙儿'])]))
    const subs = detectSubPages(doc)
    expect(subs.find((s) => s.label === '关注')).toBeUndefined()
  })
})

describe('subPageAsDoc', () => {
  it('preserves scale and source and swaps the root', () => {
    const doc = designDoc(
      frameNode('screen', 'Feed', [
        row('r1', ['A', 'B']),
        row('r2', ['C', 'D']),
      ]),
    )
    const sub = detectSubPages(doc)[0]!
    const subDoc = subPageAsDoc(doc, sub)
    expect(subDoc.root).toBe(sub.root)
    expect(subDoc.scale).toBe(1)
    expect(subDoc.source).toBe('figma')
  })
})
