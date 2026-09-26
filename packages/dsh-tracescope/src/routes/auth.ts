/**
 * Auth routes: read/save remembered git credentials and the standalone Yunxiao
 * access token.
 */
import type { Context } from '../dsh-shims.js'
import { registerRoute } from '../http/route-helpers.js'
import {
  loadRememberedYunxiaoAccess,
  loadStoredGitAuth,
  isMaskedSecret,
  parseGitAuth,
  rememberYunxiaoAccess,
  saveStoredGitAuth,
} from '@rebornace/tracescope-core'

export function registerAuthRoutes(ctx: Context) {
  registerRoute(ctx, {
    path: '/tracescope/v1/auth',
    method: 'GET',
    run: async () => {
      const auth = await loadStoredGitAuth()
      return { auth: auth ?? { mode: 'none' } }
    },
  })

  registerRoute(ctx, {
    path: '/tracescope/v1/auth-save',
    method: 'POST',
    run: async (body) => {
      const remember = body.remember !== false && body.remember !== 'false'
      const auth = parseGitAuth(body.auth)
      if (!remember || !auth || auth.mode === 'none') {
        await saveStoredGitAuth({ mode: 'none' })
        return { ok: true, auth: { mode: 'none' } }
      }
      await saveStoredGitAuth(auth)
      return {
        ok: true,
        auth:
          auth.mode === 'https'
            ? { mode: 'https', username: auth.username || 'git', token: auth.token }
            : { mode: 'ssh', privateKeyPath: auth.privateKeyPath },
      }
    },
  })

  registerRoute(ctx, {
    path: '/tracescope/v1/yunxiao-token',
    method: 'GET',
    run: async () => {
      const access = await loadRememberedYunxiaoAccess()
      return {
        token: access.token,
        endpoint: access.endpoint,
        organizationId: access.organizationId,
        hasToken: !isMaskedSecret(access.token),
      }
    },
  })

  registerRoute(ctx, {
    path: '/tracescope/v1/yunxiao-token-save',
    method: 'POST',
    run: async (body) => {
      const access = await rememberYunxiaoAccess({
        token: typeof body.token === 'string' ? body.token : '',
        endpoint: typeof body.endpoint === 'string' ? body.endpoint : undefined,
        organizationId:
          typeof body.organizationId === 'string' ? body.organizationId : undefined,
      })
      return {
        ok: true,
        endpoint: access.endpoint,
        organizationId: access.organizationId,
        hasToken: !isMaskedSecret(access.token),
      }
    },
  })
}
