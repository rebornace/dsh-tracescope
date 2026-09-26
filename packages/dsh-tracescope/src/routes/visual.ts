/**
 * Visual routes implementing the design-driven flow:
 *  - `/match-page`: locate the code pages for a design screen (best first)
 *  - `/visual-compare`: compare the design against a chosen matched page
 */
import type { Context } from '../dsh-shims.js'
import { registerRoute } from '../http/route-helpers.js'
import {
  compareDesignAgainstPage,
  matchDesignToRepo,
} from '../services/visual-flow.js'

export function registerVisualRoutes(ctx: Context) {
  registerRoute(ctx, {
    path: '/tracescope/v1/match-page',
    method: 'POST',
    run: async (body) => {
      return await matchDesignToRepo(body)
    },
  })

  registerRoute(ctx, {
    path: '/tracescope/v1/visual-compare',
    method: 'POST',
    run: async (body) => {
      return await compareDesignAgainstPage(body)
    },
  })
}
