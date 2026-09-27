/**
 * Data-directory routes: report where TraceScope stores its data (reports,
 * attachments, remembered credentials and cached clones) and relocate that
 * directory, migrating existing contents across drives.
 */
import type { Context } from '../dsh-shims.js'
import { registerRoute } from '../http/route-helpers.js'
import {
  changeDataRoot,
  defaultDataRoot,
  directorySize,
  envDataRoot,
  resolveDataRoot,
} from '@rebornace/tracescope-core'

export function registerDataDirRoutes(ctx: Context) {
  registerRoute(ctx, {
    path: '/tracescope/v1/data-dir',
    method: 'GET',
    run: async () => {
      const dataRoot = await resolveDataRoot()
      const envRoot = envDataRoot()
      const [sizeBytes] = await Promise.all([directorySize(dataRoot)])
      return {
        dataRoot,
        defaultRoot: defaultDataRoot(),
        envRoot,
        /** When TRACESCOPE_HOME is set the location is pinned by the environment. */
        envLocked: Boolean(envRoot),
        sizeBytes,
      }
    },
  })

  registerRoute(ctx, {
    path: '/tracescope/v1/data-dir-change',
    method: 'POST',
    run: async (body) => {
      const target = typeof body.dataRoot === 'string' ? body.dataRoot : ''
      const result = await changeDataRoot(target)
      const sizeBytes = await directorySize(result.dataRoot)
      return { ok: true, ...result, sizeBytes }
    },
  })
}
