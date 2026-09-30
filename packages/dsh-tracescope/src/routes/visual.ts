/**
 * Visual routes implementing the design-driven flow:
 *  - `/match-page`: locate the code pages for a design screen (best first)
 *  - `/visual-compare`: compare the design against a chosen matched page
 */
import type { Context } from '../dsh-shims.js'
import { registerRoute } from '../http/route-helpers.js'
import {
  compareDesignAgainstPage,
  compareHighFidelity,
  getDesignPageThumbnail,
  getDesignPageThumbnails,
  matchAllDesignPages,
  matchDesignToRepo,
  buildCodeVisualAnalysis,
  buildPageRematchAnalysis,
  loadPageFindings,
  aiRematchDesignPage,
} from '../services/visual-flow.js'
import { getVisualJob } from '../visual-jobs.js'

export function registerVisualRoutes(ctx: Context) {
  registerRoute(ctx, {
    path: '/tracescope/v1/match-page',
    method: 'POST',
    run: async (body) => {
      // Chat-first rematch: return a composer prompt (no silent LLM call).
      if (body.rematchPrompt === true || body.mode === 'rematch-prompt') {
        return await buildPageRematchAnalysis(body)
      }
      // Legacy silent AI rematch (prefer rematchPrompt + chat).
      if (body.aiRematch === true || body.mode === 'ai-rematch') {
        return await aiRematchDesignPage(body, ctx)
      }
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

  registerRoute(ctx, {
    path: '/tracescope/v1/match-all',
    method: 'POST',
    run: async (body) => {
      return await matchAllDesignPages(body)
    },
  })

  registerRoute(ctx, {
    path: '/tracescope/v1/hifi-compare',
    method: 'POST',
    run: async (body) => {
      return await compareHighFidelity(body, ctx)
    },
  })

  registerRoute(ctx, {
    path: '/tracescope/v1/code-visual-prompt',
    method: 'POST',
    run: async (body) => {
      return await buildCodeVisualAnalysis(body)
    },
  })

  registerRoute(ctx, {
    path: '/tracescope/v1/ai-rematch',
    method: 'POST',
    run: async (body) => {
      return await aiRematchDesignPage(body, ctx)
    },
  })

  registerRoute(ctx, {
    path: '/tracescope/v1/page-thumbnail',
    method: 'POST',
    run: async (body) => {
      return await getDesignPageThumbnail(body)
    },
  })

  registerRoute(ctx, {
    path: '/tracescope/v1/page-thumbnails',
    method: 'POST',
    run: async (body) => {
      return await getDesignPageThumbnails(body)
    },
  })

  // Poll an in-memory UI review job while the model is analysing, so the panel
  // renders the findings as soon as the model publishes them.
  registerRoute(ctx, {
    path: '/tracescope/v1/visual-job',
    method: 'POST',
    run: async (body) => {
      const id = String(body.id ?? body.jobId ?? '')
      if (!id) throw new Error('缺少 id')
      const job = getVisualJob(id)
      if (!job) throw new Error(`找不到 UI 走查任务 ${id}`)
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
    run: async (body) => {
      return await loadPageFindings(body)
    },
  })

  // Same-origin image proxy so canvas can erase designer-note pixels without CORS taint.
  registerRoute(ctx, {
    path: '/tracescope/v1/proxy-image',
    method: 'GET',
    run: async (body) => {
      const url = String(body.url ?? '').trim()
      if (!url) throw new Error('缺少 url')
      let parsed: URL
      try {
        parsed = new URL(url)
      } catch {
        throw new Error('无效的图片链接')
      }
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        throw new Error('仅支持 http(s) 图片')
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
      if (!allowed) throw new Error('不允许代理该图片域名')
      const response = await fetch(url, { redirect: 'follow' })
      if (!response.ok) {
        throw new Error(`图片代理失败：${response.status} ${response.statusText}`)
      }
      const contentType = response.headers.get('content-type') || 'image/png'
      if (!contentType.startsWith('image/')) {
        throw new Error('代理目标不是图片')
      }
      const buf = Buffer.from(await response.arrayBuffer())
      if (buf.byteLength > 8 * 1024 * 1024) throw new Error('图片过大，无法代理')
      return {
        dataUrl: `data:${contentType};base64,${buf.toString('base64')}`,
      }
    },
  })
}
