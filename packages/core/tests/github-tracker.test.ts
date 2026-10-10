import { describe, expect, it } from 'vitest'
import { githubTrackerAdapter } from '../src/tracker/adapters/github.js'
import {
  githubAttachmentMarkdown,
  resolveGithubAttachMime,
} from '../src/tracker/adapters/github-api.js'
import type { TrackerConfig } from '../src/tracker/types.js'

function tinyJpegDataUrl(): string {
  // Minimal valid-looking JPEG payload (bytes do not need to decode for upload tests).
  return `data:image/jpeg;base64,${Buffer.from('fake-jpeg').toString('base64')}`
}

describe('github tracker helpers', () => {
  it('resolves attachable mime types', () => {
    expect(resolveGithubAttachMime('a.png', 'image/png')).toBe('image/png')
    expect(resolveGithubAttachMime('a.JPG', '')).toBe('image/jpeg')
    expect(resolveGithubAttachMime('clip.mp4', 'video/mp4')).toBe('video/mp4')
    expect(resolveGithubAttachMime('notes.pdf', 'application/pdf')).toBeNull()
  })

  it('builds image vs video markdown', () => {
    expect(
      githubAttachmentMarkdown('shot.png', 'https://github.com/user-attachments/assets/x', 'image/png'),
    ).toBe('![shot.png](https://github.com/user-attachments/assets/x)')
    expect(
      githubAttachmentMarkdown('clip.mp4', 'https://github.com/user-attachments/assets/v', 'video/mp4'),
    ).toBe('https://github.com/user-attachments/assets/v')
  })
})

describe('githubTrackerAdapter.submit', () => {
  const config: TrackerConfig = {
    provider: 'github',
    github: { token: 'ghp_test', owner: 'acme', repo: 'app', labels: ['bug'] },
  }

  it('creates issue, uploads screenshot, then patches body with asset URL', async () => {
    const calls: Array<{ url: string; method: string; body?: string }> = []
    const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = (init?.method || 'GET').toUpperCase()
      const body =
        typeof init?.body === 'string'
          ? init.body
          : init?.body
            ? Buffer.from(init.body as ArrayBuffer).toString('utf8')
            : undefined
      calls.push({ url, method, body })

      if (url.endsWith('/repos/acme/app/issues') && method === 'POST') {
        return new Response(
          JSON.stringify({ number: 7, html_url: 'https://github.com/acme/app/issues/7', id: 100 }),
          { status: 201 },
        )
      }
      if (url.endsWith('/repos/acme/app') && method === 'GET') {
        return new Response(JSON.stringify({ id: 4242 }), { status: 200 })
      }
      if (url.startsWith('https://uploads.github.com/user-attachments/assets')) {
        expect(url).toContain('repository_id=4242')
        expect(url).toContain('name=login-fail.jpg')
        return new Response(
          JSON.stringify({ url: 'https://github.com/user-attachments/assets/abcd' }),
          { status: 201 },
        )
      }
      if (url.endsWith('/repos/acme/app/issues/7') && method === 'PATCH') {
        return new Response(JSON.stringify({ number: 7 }), { status: 200 })
      }
      return new Response(JSON.stringify({ message: `unexpected ${method} ${url}` }), {
        status: 500,
      })
    }

    const result = await githubTrackerAdapter.submit(
      config,
      {
        repoPath: '/tmp/app',
        baseCommit: 'aaa',
        headCommit: 'bbb',
        subject: '[TraceScope] fail',
        description: 'placeholder',
        lang: 'en',
        items: [
          {
            id: '1',
            displayName: 'Login',
            kind: 'direct',
            risk: 'high',
            files: ['Login.kt'],
            evidence: [],
            suggestedSteps: [],
            status: 'fail',
            testerNote: 'no response',
            testerScreenshots: [
              {
                id: 's1',
                name: 'login-fail.jpg',
                mime: 'image/jpeg',
                dataUrl: tinyJpegDataUrl(),
              },
            ],
          },
        ],
      },
      fetchImpl as unknown as typeof fetch,
    )

    expect(result.ok).toBe(true)
    expect(result.id).toBe('7')
    expect(result.url).toBe('https://github.com/acme/app/issues/7')
    expect(result.uploadedAttachments).toBe(1)
    expect(result.failedAttachments).toBe(0)

    const createCall = calls.find((c) => c.method === 'POST' && c.url.endsWith('/issues'))
    expect(createCall?.body).toBeTruthy()
    expect(createCall!.body!).not.toContain('data:image')
    expect(createCall!.body!).toContain('verification failure feedback')

    const patchCall = calls.find((c) => c.method === 'PATCH')
    expect(patchCall?.body).toContain('https://github.com/user-attachments/assets/abcd')
    expect(patchCall?.body).toContain('![login-fail.jpg]')
    const uploadCall = calls.find((c) => c.url.startsWith('https://uploads.github.com/'))
    expect(uploadCall).toBeTruthy()
  })

  it('falls back to repo contents when user-attachments is unavailable', async () => {
    const calls: string[] = []
    const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = (init?.method || 'GET').toUpperCase()
      calls.push(`${method} ${url}`)
      if (url.endsWith('/issues') && method === 'POST') {
        return new Response(
          JSON.stringify({ number: 9, html_url: 'https://github.com/acme/app/issues/9' }),
          { status: 201 },
        )
      }
      if (url.endsWith('/repos/acme/app') && method === 'GET') {
        return new Response(JSON.stringify({ id: 4242 }), { status: 200 })
      }
      if (url.startsWith('https://uploads.github.com/')) {
        return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 })
      }
      if (url.includes('/contents/.tracescope/') && method === 'PUT') {
        return new Response(
          JSON.stringify({
            content: {
              download_url:
                'https://raw.githubusercontent.com/acme/app/main/.tracescope/issues/9/login-fail.jpg',
            },
          }),
          { status: 201 },
        )
      }
      if (url.endsWith('/issues/9') && method === 'PATCH') {
        return new Response(JSON.stringify({ number: 9 }), { status: 200 })
      }
      return new Response(JSON.stringify({ message: `unexpected ${method} ${url}` }), {
        status: 500,
      })
    }

    const result = await githubTrackerAdapter.submit(
      config,
      {
        repoPath: '/tmp/app',
        baseCommit: 'aaa',
        headCommit: 'bbb',
        subject: 'fail',
        description: 'x',
        lang: 'zh',
        items: [
          {
            id: '1',
            displayName: '\u767b\u5f55',
            kind: 'direct',
            risk: 'high',
            files: [],
            evidence: [],
            suggestedSteps: [],
            status: 'fail',
            testerNote: 'x',
            testerScreenshots: [
              {
                id: 's1',
                name: 'login-fail.jpg',
                mime: 'image/jpeg',
                dataUrl: tinyJpegDataUrl(),
              },
            ],
          },
        ],
      },
      fetchImpl as unknown as typeof fetch,
    )

    expect(result.ok).toBe(true)
    expect(result.uploadedAttachments).toBe(1)
    expect(calls.some((c) => c.includes('/contents/.tracescope/'))).toBe(true)
  })

  it('still creates the issue when there are no screenshots', async () => {
    const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = (init?.method || 'GET').toUpperCase()
      if (url.endsWith('/issues') && method === 'POST') {
        return new Response(
          JSON.stringify({ number: 3, html_url: 'https://github.com/acme/app/issues/3' }),
          { status: 201 },
        )
      }
      return new Response(JSON.stringify({ message: `unexpected ${method} ${url}` }), {
        status: 500,
      })
    }

    const result = await githubTrackerAdapter.submit(
      config,
      {
        repoPath: '/tmp/app',
        baseCommit: 'a',
        headCommit: 'b',
        subject: 'fail',
        description: 'x',
        lang: 'zh',
        items: [
          {
            id: '1',
            displayName: 'Pay',
            kind: 'direct',
            risk: 'medium',
            files: [],
            evidence: [],
            suggestedSteps: [],
            status: 'fail',
            testerNote: 'timeout',
          },
        ],
      },
      fetchImpl as unknown as typeof fetch,
    )

    expect(result.ok).toBe(true)
    expect(result.id).toBe('3')
    expect(result.uploadedAttachments).toBe(0)
  })
})
