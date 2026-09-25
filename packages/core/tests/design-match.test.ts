import { describe, expect, it } from 'vitest'
import {
  designFingerprint,
  matchPages,
  normalizeText,
  scorePage,
  tokenizeName,
} from '../src/design/page-fingerprint.js'
import type {
  CodePage,
  PageFingerprint,
} from '../src/design/adapters/adapter-types.js'
import type { DesignDoc, DesignNode } from '../src/design/types.js'

function textNode(id: string, text: string): DesignNode {
  return { id, name: text, kind: 'text', text, box: {}, style: {}, children: [] }
}

function frame(id: string, name: string, children: DesignNode[]): DesignNode {
  return { id, name, kind: 'frame', box: {}, style: {}, children }
}

function designDoc(root: DesignNode): DesignDoc {
  return { root, scale: 1, source: 'figma' }
}

function page(
  relativePath: string,
  fingerprint: PageFingerprint,
  precise = true,
): CodePage {
  return {
    adapterId: precise ? 'android-xml' : 'android-compose',
    platform: 'android',
    kindLabel: precise ? 'Android XML' : 'Jetpack Compose',
    relativePath,
    absolutePath: `/repo/${relativePath}`,
    precise,
    fingerprint,
  }
}

function fp(texts: string[], nameTokens: string[], controlCount = 0): PageFingerprint {
  return { texts, nameTokens, controlCount }
}

describe('fingerprint text helpers', () => {
  it('normalizes text by lowercasing and stripping whitespace', () => {
    expect(normalizeText('  Hello   World ')).toBe('helloworld')
    expect(normalizeText('你好 世界')).toBe('你好世界')
    expect(normalizeText(undefined)).toBe('')
  })

  it('tokenizes names on non-alphanumeric boundaries', () => {
    expect(tokenizeName('LoginScreen.kt')).toEqual(['loginscreen', 'kt'])
    expect(tokenizeName('user_profile-page')).toEqual(['user', 'profile', 'page'])
    expect(tokenizeName('登录页')).toEqual(['登录页'])
  })
})

describe('designFingerprint', () => {
  it('collects unique normalized texts and counts controls', () => {
    const doc = designDoc(
      frame('screen', 'Login', [
        textNode('t1', '登录'),
        textNode('t2', '忘记密码'),
        frame('group-holder', 'holder', [textNode('t3', '登录')]),
      ]),
    )
    const f = designFingerprint(doc)
    expect(f.texts.sort()).toEqual(['忘记密码', '登录'])
    expect(f.nameTokens).toContain('login')
    expect(f.controlCount).toBeGreaterThanOrEqual(3)
  })
})

describe('scorePage', () => {
  it('rewards text overlap and records a reason', () => {
    const target = fp(['登录', '忘记密码'], ['login'], 2)
    const match = scorePage(
      target,
      page('login.xml', fp(['登录', '忘记密码'], ['login'], 2)),
    )
    expect(match.score).toBeGreaterThan(0.6)
    expect(match.reasons.join(' ')).toContain('文案命中')
  })

  it('scores an unrelated page near zero', () => {
    const target = fp(['登录'], ['login'], 1)
    const match = scorePage(
      target,
      page('settings.xml', fp(['设置', '退出登录'], ['settings'], 8)),
    )
    expect(match.score).toBeLessThan(0.2)
  })
})

describe('matchPages', () => {
  it('ranks the correct page first across mixed implementations', () => {
    const doc = designDoc(
      frame('s', 'Login', [textNode('a', '登录'), textNode('b', '注册')]),
    )
    const pages: CodePage[] = [
      page('Home/home.xml', fp(['首页', '推荐'], ['home'], 6)),
      page('Login/login.xml', fp(['登录', '注册'], ['login'], 2)),
      // Compose implementation of the same screen: locator only.
      {
        ...page('Login/LoginScreen.kt', fp(['登录', '注册'], ['loginscreen'], 2), false),
      },
    ]
    const matches = matchPages(doc, pages)
    expect(matches.length).toBeGreaterThanOrEqual(1)
    // Best candidate should be the matching login page (XML variant wins ties).
    expect(matches[0]!.page.relativePath).toMatch(/login/i)
  })

  it('drops pages below the threshold', () => {
    const doc = designDoc(frame('s', 'X', [textNode('a', '完全不同的文案')]))
    const pages: CodePage[] = [
      page('a.xml', fp(['毫无关系'], ['other'], 10)),
    ]
    const matches = matchPages(doc, pages)
    expect(matches).toHaveLength(0)
  })

  it('respects a custom minScore', () => {
    const doc = designDoc(
      frame('s', 'X', [textNode('a', '你好'), textNode('b', '世界')]),
    )
    // Only one of two texts matches: a mid-confidence candidate.
    const pages: CodePage[] = [
      page('a.xml', fp(['你好', '其它'], ['z'], 6)),
    ]
    const matches = matchPages(doc, pages)
    expect(matches.length).toBeGreaterThan(0)
    const strict = matchPages(doc, pages, { minScore: 0.9 })
    expect(strict).toHaveLength(0)
  })
})
