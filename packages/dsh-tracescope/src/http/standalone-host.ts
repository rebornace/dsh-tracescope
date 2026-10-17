/**
 * Minimal Cordis-like Context so the same `registerRoute` / `register*Routes`
 * stack can serve the MCP standalone panel over Node's `http.Server`.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context, WebServerRegistration } from '../dsh-shims.js'

type ExactHandler = WebServerRegistration['handler']

export interface StandaloneHost {
  ctx: Context
  /** Dispatch a request to a registered exact path, or return false. */
  dispatch: (req: IncomingMessage, res: ServerResponse) => Promise<boolean>
  dispose: () => void
}

/**
 * Create a fake DSH host that records `webServer.register({ kind: 'exact' })`
 * handlers. `effect(fn)` runs `fn` immediately (Cordis runs effects on apply).
 */
export function createStandaloneHost(): StandaloneHost {
  const exact = new Map<string, ExactHandler>()
  const disposers: Array<() => void> = []

  const webServer = {
    register: (route: WebServerRegistration) => {
      if (route.kind !== 'exact') {
        // Prefix routes are unused by TraceScope today; ignore safely.
        return () => undefined
      }
      const path = route.path
      exact.set(path, route.handler)
      const dispose = () => {
        if (exact.get(path) === route.handler) exact.delete(path)
      }
      disposers.push(dispose)
      return dispose
    },
  }

  const ctx: Context = {
    tools: { register: () => undefined },
    commands: { register: () => undefined },
    webServer,
    effect: (fn) => {
      try {
        const cleanup = fn()
        if (typeof cleanup === 'function') disposers.push(cleanup)
      } catch (err) {
        console.warn('[tracescope] standalone effect failed', err)
      }
    },
    get: () => undefined,
  }

  return {
    ctx,
    async dispatch(req, res) {
      const host = String(req.headers.host ?? '127.0.0.1')
      const url = new URL(req.url ?? '/', `http://${host}`)
      const handler = exact.get(url.pathname)
      if (!handler) return false
      await handler(req as Parameters<ExactHandler>[0], res as Parameters<ExactHandler>[1])
      return true
    },
    dispose() {
      for (const d of disposers.splice(0)) {
        try {
          d()
        } catch {
          /* ignore */
        }
      }
      exact.clear()
    },
  }
}
