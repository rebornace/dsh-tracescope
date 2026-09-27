import { describe, expect, it } from 'vitest'
import { fetchFigmaDoc } from '../src/design/sources/figma.js'

const URL = 'https://www.figma.com/design/KEY/file?node-id=0-1'
const TOKEN = 'tok'

const nodesPayload = (node: Record<string, unknown>) => ({
  nodes: { '0:1': { document: node } },
})

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function networkError() {
  // Mimic undici: TypeError("fetch failed") wrapping a connect timeout cause.
  const cause = new Error('Connect Timeout Error') as Error & { code: string }
  cause.code = 'UND_ERR_CONNECT_TIMEOUT'
  const err = new TypeError('fetch failed') as TypeError & { cause: unknown }
  err.cause = cause
  return err
}

describe('figma transport retries', () => {
  it('retries transient network errors and then succeeds', async () => {
    let calls = 0
    const fetchImpl = (async () => {
      calls += 1
      if (calls <= 2) throw networkError()
      return jsonResponse(
        nodesPayload({ id: '0:1', name: 'Screen', type: 'FRAME', children: [] }),
      )
    }) as typeof fetch

    const doc = await fetchFigmaDoc(URL, undefined, {
      token: TOKEN,
      fetchImpl,
      timeoutMs: 1000,
    })
    expect(calls).toBe(3)
    expect(doc.root.name).toBe('Screen')
  })

  it('does not retry an HTTP 4xx (auth) failure', async () => {
    let calls = 0
    const fetchImpl = (async () => {
      calls += 1
      return new Response('Forbidden', { status: 403 })
    }) as typeof fetch

    await expect(
      fetchFigmaDoc(URL, undefined, { token: TOKEN, fetchImpl }),
    ).rejects.toThrow(/403/)
    expect(calls).toBe(1)
  })

  it('surfaces a friendly Chinese timeout message after exhausting retries', async () => {
    let calls = 0
    const fetchImpl = (async () => {
      calls += 1
      throw networkError()
    }) as typeof fetch

    await expect(
      fetchFigmaDoc(URL, undefined, {
        token: TOKEN,
        fetchImpl,
        attempts: 2,
        timeoutMs: 1,
      }),
    ).rejects.toThrow(/重试 2 次/)
    expect(calls).toBe(2)
  })
})
