/**
 * HTTP plumbing shared by every TraceScope route: JSON responses, same-origin
 * trust checks, body parsing and the small `registerRoute` wrapper around the
 * DSH webServer. Keeping this in one place lets route modules stay declarative.
 */
import type { Context } from '../dsh-shims.js'
import { langFromBody, langFromRequest, type Lang } from '../i18n/lang.js'
import { localizeError, msg } from '../i18n/messages.js'

export function sendJson(res: { writeHead: Function; end: Function }, status: number, payload: unknown) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  })
  res.end(body)
}

function headerHost(value: string): string {
  try {
    return new URL(value).host
  } catch {
    return ''
  }
}

/** True when the request target is a loopback host (with optional port). */
function isLoopbackHost(host: string): boolean {
  const h = host.toLowerCase()
  return (
    h === '127.0.0.1' ||
    h === 'localhost' ||
    h === '[::1]' ||
    h.startsWith('127.0.0.1:') ||
    h.startsWith('localhost:') ||
    h.startsWith('[::1]:')
  )
}

/** Opaque / missing Origin (Electron sidebar often sends the literal `null`). */
function isOpaqueOrigin(origin: string): boolean {
  const o = origin.trim().toLowerCase()
  return o === '' || o === 'null'
}

function hostsMatch(a: string, b: string): boolean {
  if (!a || !b) return false
  if (a === b) return true
  // Desktop may mix 127.0.0.1 and localhost for the same loopback service.
  return isLoopbackHost(a) && isLoopbackHost(b)
}

/**
 * Decide whether a request may drive the local TraceScope API.
 *
 * Cross-site attackers always send a concrete `Origin` (their site). We reject
 * those unless the origin host matches the request host.
 *
 * Official DeepSeek Harness Desktop embeds the sidebar in a context that often
 * sends `Origin: null` (or strips Origin/Referer). Those are treated as opaque
 * and allowed — requiring a loopback Host alone was too strict for Desktop's
 * own webServer host, and treating literal `null` as a failed URL parse caused
 * `untrusted request` on every analyze call.
 */
export function isTrustedRequest(req: { headers: Record<string, string | string[] | undefined> }) {
  const host = String(req.headers.host ?? '')
  const origin = String(req.headers.origin ?? '')
  const referer = String(req.headers.referer ?? '')
  const secFetchSite = String(req.headers['sec-fetch-site'] ?? '').toLowerCase()

  if (!isOpaqueOrigin(origin)) {
    return hostsMatch(headerHost(origin), host)
  }

  if (referer !== '') {
    return hostsMatch(headerHost(referer), host)
  }

  // No usable Origin/Referer: embedded Desktop slot / same-origin fetch.
  if (isLoopbackHost(host)) return true
  if (secFetchSite === 'same-origin' || secFetchSite === 'same-site' || secFetchSite === 'none') {
    return true
  }
  // Last resort for DSH Host webServer: Host is present and Origin was opaque.
  return host.length > 0
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

export interface RouteContext {
  lang: Lang
  req: { headers: Record<string, string | string[] | undefined> }
}

export interface RouteOptions {
  path: string
  method?: string
  /** Override JSON body size limit (bytes). */
  maxBodyBytes?: number
  run: (body: Record<string, unknown>, ctx: RouteContext) => Promise<unknown>
}

interface MethodRoute {
  maxBodyBytes?: number
  run: RouteOptions['run']
}

/**
 * DSH host webServer allows only one exact handler per path. Fan out methods
 * in-process so GET+POST on the same path does not throw at register time
 * (which would abort later routes in the same `apply` batch).
 */
const routesByCtx = new WeakMap<Context, Map<string, Map<string, MethodRoute>>>()

/** Register one same-origin JSON route with the DSH web server. */
export function registerRoute(ctx: Context, options: RouteOptions) {
  const method = (options.method ?? 'POST').toUpperCase()
  let byPath = routesByCtx.get(ctx)
  if (!byPath) {
    byPath = new Map()
    routesByCtx.set(ctx, byPath)
  }
  let byMethod = byPath.get(options.path)
  const isFirstForPath = !byMethod
  if (!byMethod) {
    byMethod = new Map()
    byPath.set(options.path, byMethod)
  }
  byMethod.set(method, { maxBodyBytes: options.maxBodyBytes, run: options.run })
  if (!isFirstForPath) return

  return ctx.effect?.(
    () => {
      const methods = byPath!.get(options.path)!
      return ctx.webServer!.register({
        kind: 'exact',
        path: options.path,
        handler: async (req, res) => {
          const reqMethod = String(req.method ?? 'GET').toUpperCase()
          const acceptLang = langFromRequest(req)
          const allowed = [...methods.keys()]
          // Browser / embedded webviews may probe with OPTIONS before POST.
          if (reqMethod === 'OPTIONS') {
            res.writeHead(204, {
              'access-control-allow-methods': `${allowed.join(',')},OPTIONS`,
              'access-control-allow-headers': 'content-type, accept-language',
              'access-control-max-age': '86400',
              'content-length': 0,
            })
            res.end()
            return
          }
          const route = methods.get(reqMethod)
          if (!route) {
            const expect = allowed.join('|') || 'POST'
            return sendJson(res, 405, {
              error: msg('ERR_METHOD_NOT_ALLOWED', acceptLang, { method: expect, reqMethod }),
              code: 'ERR_METHOD_NOT_ALLOWED',
            })
          }
          if (!isTrustedRequest(req)) {
            return sendJson(res, 403, {
              error: msg('ERR_UNTRUSTED', acceptLang),
              code: 'ERR_UNTRUSTED',
            })
          }
          let body: Record<string, unknown> = {}
          let lang = acceptLang
          if (reqMethod !== 'GET') {
            try {
              body = (await readJsonBody(req, route.maxBodyBytes)) as Record<string, unknown>
              lang = langFromBody(body, acceptLang)
            } catch (error: unknown) {
              const localized = localizeError(error, acceptLang)
              return sendJson(res, 400, localized)
            }
          } else {
            const host = String(req.headers.host ?? '127.0.0.1')
            const url = new URL(req.url ?? '/', `http://${host}`)
            body = Object.fromEntries(url.searchParams.entries())
            lang = langFromBody(body, acceptLang)
          }
          const routeCtx: RouteContext = { lang, req }
          try {
            sendJson(res, 200, await route.run(body, routeCtx))
          } catch (error: unknown) {
            const localized = localizeError(error, lang)
            sendJson(res, 400, localized)
          }
        },
      })
    },
    `tracescope: ${options.path}`,
  )
}
