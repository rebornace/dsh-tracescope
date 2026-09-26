/**
 * HTTP plumbing shared by every TraceScope route: JSON responses, same-origin
 * trust checks, body parsing and the small `registerRoute` wrapper around the
 * DSH webServer. Keeping this in one place lets route modules stay declarative.
 */
import type { Context } from '../dsh-shims.js'

export function sendJson(res: { writeHead: Function; end: Function }, status: number, payload: unknown) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  })
  res.end(body)
}

export function isTrustedRequest(req: { headers: Record<string, string | string[] | undefined> }) {
  const host = String(req.headers.host ?? '')
  const referer = String(req.headers.referer ?? '')
  try {
    return referer !== '' && new URL(referer).host === host
  } catch {
    return false
  }
}

export function readJsonBody(
  req: {
    on: (event: string, cb: (...args: any[]) => void) => void
    destroy?: () => void
  },
  maxBytes = 8 * 1024 * 1024,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > maxBytes) {
        reject(new Error('body too large'))
        req.destroy?.()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8')
        resolve(raw === '' ? {} : JSON.parse(raw))
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

export function parseFetchFlag(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null || value === '') return fallback
  if (typeof value === 'boolean') return value
  const s = String(value).toLowerCase()
  if (s === '1' || s === 'true' || s === 'yes') return true
  if (s === '0' || s === 'false' || s === 'no') return false
  return fallback
}

export interface RouteOptions {
  path: string
  method?: string
  /** Override JSON body size limit (bytes). */
  maxBodyBytes?: number
  run: (body: Record<string, unknown>) => Promise<unknown>
}

/** Register one same-origin JSON route with the DSH web server. */
export function registerRoute(ctx: Context, options: RouteOptions) {
  const method = options.method ?? 'POST'
  return ctx.effect?.(
    () =>
      ctx.webServer!.register({
        kind: 'exact',
        path: options.path,
        handler: async (req, res) => {
          if (req.method !== method) return sendJson(res, 405, { error: 'method not allowed' })
          if (!isTrustedRequest(req)) return sendJson(res, 403, { error: 'untrusted request' })
          let body: Record<string, unknown> = {}
          if (method !== 'GET') {
            try {
              body = (await readJsonBody(req, options.maxBodyBytes)) as Record<string, unknown>
            } catch (error: unknown) {
              const message = error instanceof Error ? error.message : 'invalid body'
              return sendJson(res, 400, {
                error: message === 'body too large' ? '请求体过大，请缩小清单后重试' : 'invalid body',
              })
            }
          } else {
            const host = String(req.headers.host ?? '127.0.0.1')
            const url = new URL(req.url ?? '/', `http://${host}`)
            body = Object.fromEntries(url.searchParams.entries())
          }
          try {
            sendJson(res, 200, await options.run(body))
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error)
            sendJson(res, 400, { error: message })
          }
        },
      }),
    `tracescope: ${options.path}`,
  )
}
