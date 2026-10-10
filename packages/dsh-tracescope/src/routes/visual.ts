/**
 * Visual routes implementing the design-driven flow:
 *  - `/match-page`: locate the code pages for a design screen (best first)
 *  - `/visual-compare`: compare the design against a chosen matched page
 */
import type { Context } from '../dsh-shims.js'
import { registerRoute } from '../http/route-helpers.js'
import {
  compareDesignAgainstPage,
  compareDesignStatic,
  getDesignPageThumbnail,
  getDesignPageThumbnails,
  matchAllDesignPages,
  matchDesignToRepo,
  buildCodeVisualAnalysis,
  buildPageRematchAnalysis,
  loadPageFindings,
  aiRematchDesignPage,
} from '../services/visual-flow.js'
import { I18nError } from '../i18n/messages.js'
import { getVisualJob } from '../visual-jobs.js'

export function registerVisualRoutes(ctx: Context) {
  registerRoute(ctx, {
    path: '/tracescope/v1/match-page',
    method: 'POST',
    run: async (body, { lang }) => {
      const localized: Record<string, unknown> = {
        ...body,
        locale: body.locale ?? body.lang ?? lang,
      }
      // Chat-first rematch: return a composer prompt (no silent LLM call).
      if (localized.rematchPrompt === true || localized.mode === 'rematch-prompt') {
        return await buildPageRematchAnalysis(localized)
      }
      // Legacy silent AI rematch (prefer rematchPrompt + chat).
      if (localized.aiRematch === true || localized.mode === 'ai-rematch') {
        return await aiRematchDesignPage(localized, ctx)
      }
      return await matchDesignToRepo(localized)
    },
  })

  registerRoute(ctx, {
    path: '/tracescope/v1/visual-compare',
    method: 'POST',
    run: async (body, { lang }) => {
      return await compareDesignAgainstPage({
        ...body,
        locale: body.locale ?? body.lang ?? lang,
      } as Record<string, unknown>)
    },
  })

  registerRoute(ctx, {
    path: '/tracescope/v1/match-all',
    method: 'POST',
    run: async (body, { lang }) => {
      return await matchAllDesignPages({
        ...body,
        locale: body.locale ?? body.lang ?? lang,
      } as Record<string, unknown>)
    },
  })

  registerRoute(ctx, {
    path: '/tracescope/v1/design-compare',
    method: 'POST',
    run: async (body, { lang }) => {
      return await compareDesignStatic(
        { ...body, locale: body.locale ?? body.lang ?? lang } as Record<string, unknown>,
        ctx,
      )
    },
  })

  // Legacy alias — prefer /design-compare.
  registerRoute(ctx, {
    path: '/tracescope/v1/hifi-compare',
    method: 'POST',
    run: async (body, { lang }) => {
      return await compareDesignStatic(
        { ...body, locale: body.locale ?? body.lang ?? lang } as Record<string, unknown>,
        ctx,
      )
    },
  })

  registerRoute(ctx, {
    path: '/tracescope/v1/code-visual-prompt',
    method: 'POST',
    run: async (body, { lang }) => {
      return await buildCodeVisualAnalysis({
        ...body,
        locale: body.locale ?? body.lang ?? lang,
      } as Record<string, unknown>)
    },
  })

  registerRoute(ctx, {
    path: '/tracescope/v1/ai-rematch',
    method: 'POST',
    run: async (body, _ctx) => {
      return await aiRematchDesignPage(body, ctx)
    },
  })

  registerRoute(ctx, {
    path: '/tracescope/v1/page-thumbnail',
    method: 'POST',
    run: async (body, _ctx) => {
      return await getDesignPageThumbnail(body)
    },
  })

  registerRoute(ctx, {
    path: '/tracescope/v1/page-thumbnails',
    method: 'POST',
    run: async (body, _ctx) => {
      return await getDesignPageThumbnails(body)
    },
  })

  // Poll an in-memory UI review job while the model is analysing, so the panel
  // renders the findings as soon as the model publishes them.
  registerRoute(ctx, {
    path: '/tracescope/v1/visual-job',
    method: 'POST',
    run: async (body, { lang }) => {
      const id = String(body.id ?? body.jobId ?? '')
      if (!id) throw new I18nError('ERR_MISSING_ID', lang)
      const job = getVisualJob(id)
      if (!job) throw new I18nError('ERR_VISUAL_JOB_NOT_FOUND', lang, { id })
      return {
        jobId: job.id,
        status: job.status,
        kind: job.kind,
        error: job.error,
        findings: job.findings,
        rematch: job.rematch,
        designId: job.designId,
        updatedAt: job.updatedAt,
      }
    },
  })

  // Load persisted findings for a page (after the plugin reopens).
  registerRoute(ctx, {
    path: '/tracescope/v1/visual-findings-load',
    method: 'POST',
    run: async (body, _ctx) => {
      return await loadPageFindings(body)
    },
  })

  // Same-origin image proxy so canvas can erase designer-note pixels without CORS taint.
  registerRoute(ctx, {
    path: '/tracescope/v1/proxy-image',
    method: 'GET',
    run: async (body, { lang }) => {
      const url = String(body.url ?? '').trim()
      if (!url) throw new I18nError('ERR_MISSING_URL', lang)
      let parsed: URL
      try {
        parsed = new URL(url)
      } catch {
        throw new I18nError('ERR_INVALID_IMAGE_URL', lang)
      }
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        throw new I18nError('ERR_IMAGE_HTTP_ONLY', lang)
      }
      const host = parsed.hostname.toLowerCase()
      const allowed =
        host === 'figma.com' ||
        host.endsWith('.figma.com') ||
        host.endsWith('.figma.site') ||
        host.endsWith('.amazonaws.com') ||
        host.endsWith('.cloudfront.net') ||
        host === 'lanhuapp.com' ||
        host.endsWith('.lanhuapp.com') ||
        host === 'lanhu.woa.com' ||
        host.endsWith('.lanhu.woa.com') ||
        host.endsWith('.aliyuncs.com') ||
        host.endsWith('.myqcloud.com') ||
        host.endsWith('.qcloud.com')
      if (!allowed) throw new I18nError('ERR_IMAGE_PROXY_DOMAIN', lang)
      const response = await fetch(url, { redirect: 'follow' })
      if (!response.ok) {
        throw new I18nError('ERR_IMAGE_PROXY_FAILED', lang, {
          status: response.status,
          statusText: response.statusText,
        })
      }
      const contentType = response.headers.get('content-type') || 'image/png'
      if (!contentType.startsWith('image/')) {
        throw new I18nError('ERR_IMAGE_PROXY_NOT_IMAGE', lang)
      }
      const buf = Buffer.from(await response.arrayBuffer())
      if (buf.byteLength > 8 * 1024 * 1024) throw new I18nError('ERR_IMAGE_TOO_LARGE', lang)
      return {
        dataUrl: `data:${contentType};base64,${buf.toString('base64')}`,
      }
    },
  })
}
