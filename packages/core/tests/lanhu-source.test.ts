import { describe, expect, it } from 'vitest'
import {
  isLanhuUrl,
  parseLanhuUrl,
  buildLanhuImageUrl,
  normalizeLanhuAnnotation,
  fetchLanhuDoc,
} from '../src/design/sources/lanhu.js'

describe('lanhu url parsing', () => {
  it('detects lanhu hosts', () => {
    expect(isLanhuUrl('https://lanhuapp.com/web/#/item/project/detailDetach?pid=abc')).toBe(true)
    expect(isLanhuUrl('https://lanhu.woa.com/web/#/x')).toBe(true)
    expect(isLanhuUrl('https://www.figma.com/design/KEY/file')).toBe(false)
  })

  it('parses hash-routed detail links', () => {
    const url =
      'https://lanhuapp.com/web/#/item/project/detailDetach?tid=12&pid=proj-1&project_id=proj-1&image_id=img-99'
    const parts = parseLanhuUrl(url)
    expect(parts.tenantId).toBe('12')
    expect(parts.projectId).toBe('proj-1')
    expect(parts.imageId).toBe('img-99')
    expect(parts.host).toContain('lanhuapp.com')
  })

  it('builds image-specific urls', () => {
    const base =
      'https://lanhuapp.com/web/#/item/project/stage?tid=1&pid=p1&project_id=p1'
    const next = buildLanhuImageUrl(base, 'image-xyz')
    expect(next).toContain('image_id=image-xyz')
    expect(next).toContain('project_id=p1')
  })

  it('parses stage project links without image_id', () => {
    const url =
      'https://lanhuapp.com/web/#/item/project/stage?tid=0d911feb-df4f-4b9b-8dea-60adff59a7cb&pid=f07565f9-4316-4e3a-b278-2406bc17c261'
    expect(isLanhuUrl(url)).toBe(true)
    const parts = parseLanhuUrl(url)
    expect(parts.tenantId).toBe('0d911feb-df4f-4b9b-8dea-60adff59a7cb')
    expect(parts.projectId).toBe('f07565f9-4316-4e3a-b278-2406bc17c261')
    expect(parts.imageId).toBe('')
  })
})

describe('lanhu annotation normalize', () => {
  it('converts artboard tree to DesignDoc', () => {
    const doc = normalizeLanhuAnnotation(
      {
        ArtboardScale: 2,
        info: [
          {
            id: 'board-1',
            name: '首页',
            width: 750,
            height: 1624,
            left: 0,
            top: 0,
            layers: [
              {
                id: 't1',
                name: '标题',
                width: 200,
                height: 40,
                left: 32,
                top: 80,
                text: { text: '你好' },
                style: { fontSize: 32, fontFamily: 'PingFang SC', textColor: { r: 0, g: 0, b: 0, a: 1 } },
              },
            ],
          },
        ],
      },
      { imageId: 'img-1', name: '首页' },
    )
    expect(doc.source).toBe('lanhu')
    expect(doc.root.name).toBe('首页')
    expect(doc.root.id).toBe('img-1')
    expect(doc.root.box.width).toBe(375)
    expect(doc.root.children[0]?.kind).toBe('text')
    expect(doc.root.children[0]?.text).toBe('你好')
    expect(doc.root.children[0]?.style.fontSize).toBe(16)
  })
})

describe('lanhu fetch', () => {
  it('loads detail + annotation json', async () => {
    const calls: string[] = []
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input)
      calls.push(url)
      if (url.includes('/api/project/image')) {
        return new Response(
          JSON.stringify({
            code: '00000',
            result: {
              name: '登录页',
              url: 'https://cdn.example.com/cover.png',
              versions: [{ json_url: 'https://cdn.example.com/anno.json' }],
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }
      if (url.includes('anno.json')) {
        return new Response(
          JSON.stringify({
            ArtboardScale: 2,
            info: [{ id: 'b', name: '登录页', width: 750, height: 1334, left: 0, top: 0, layers: [] }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }
      return new Response('not found', { status: 404 })
    }) as typeof fetch

    const doc = await fetchLanhuDoc(
      'https://lanhuapp.com/web/#/item/project/detailDetach?tid=0&pid=p&project_id=p&image_id=i1',
      { cookie: 'session=abc', fetchImpl },
    )
    expect(doc.root.name).toBe('登录页')
    expect(doc.source).toBe('lanhu')
    expect(calls.some((c) => c.includes('/api/project/image'))).toBe(true)
    expect(calls.some((c) => c.includes('anno.json'))).toBe(true)
  })
})
