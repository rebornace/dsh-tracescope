/**
 * Visual (design-driven) workflow service.
 *
 * Resolves the repository to a readable checkout, fetches the design doc and
 * either locates the matching code pages or compares a chosen page. This is
 * where the new "design screen -> find the page -> compare" flow lives.
 */
import {
  compareDesignWithPage,
  ensureReadableCheckout,
  fetchFigmaDoc,
  locatePagesForDesign,
  parseGitAuth,
  resolveGitRepo,
  type DesignDoc,
  discoverAllPages,
} from '@rebornace/tracescope-core'
import { resolveRequestGitAuth } from './request-auth.js'

export interface VisualRepoContext {
  repoInput: string
  checkoutPath: string
}

/** Resolve the repo and ensure files are readable (attaches a worktree to bare clones). */
export async function resolveVisualRepo(
  repoInput: string,
  body: Record<string, unknown>,
): Promise<VisualRepoContext> {
  const auth = await resolveRequestGitAuth(parseGitAuth(body.auth), repoInput)
  const resolved = await resolveGitRepo(repoInput, { fetch: true, auth })
  const checkout = await ensureReadableCheckout(resolved.repoPath, auth)
  return { repoInput, checkoutPath: checkout.checkoutPath }
}

/** Fetch the design doc from the Figma link/token. */
export async function loadDesign(body: Record<string, unknown>): Promise<DesignDoc> {
  const figmaUrl = String(body.figmaUrl ?? '').trim()
  const figmaToken = String(body.figmaToken ?? '').trim()
  if (!figmaUrl || !figmaToken) throw new Error('需要设计稿链接和访问 Token')
  return await fetchFigmaDoc(figmaUrl, undefined, { token: figmaToken })
}

/** Locate candidate code pages for the design screen, best first. */
export async function matchDesignToRepo(
  body: Record<string, unknown>,
): Promise<{ candidates: unknown[] }> {
  const repoInput = String(body.repoPath ?? body.repo ?? '').trim()
  if (!repoInput) throw new Error('缺少 repoPath')
  const ctx = await resolveVisualRepo(repoInput, body)
  const design = await loadDesign(body)
  const matches = await locatePagesForDesign(design, ctx.checkoutPath)
  return {
    candidates: matches.map((m) => ({
      adapterId: m.page.adapterId,
      platform: m.page.platform,
      kindLabel: m.page.kindLabel,
      relativePath: m.page.relativePath,
      precise: m.page.precise,
      score: m.score,
      reasons: m.reasons,
    })),
  }
}

export interface CompareOutcome {
  page: {
    adapterId: string
    kindLabel: string
    relativePath: string
    precise: boolean
  }
  precise: boolean
  result?: import('@rebornace/tracescope-core').VisualCompareResult
  reason?: string
}

/** Compare the design against a specific matched page. */
export async function compareDesignAgainstPage(
  body: Record<string, unknown>,
): Promise<CompareOutcome> {
  const repoInput = String(body.repoPath ?? body.repo ?? '').trim()
  const adapterId = String(body.adapterId ?? '')
  const relativePath = String(body.relativePath ?? '')
  if (!repoInput || !adapterId || !relativePath) {
    throw new Error('需要 repoPath、adapterId、relativePath')
  }
  const ctx = await resolveVisualRepo(repoInput, body)
  const design = await loadDesign(body)

  // Re-discover pages to obtain the selected page object.
  const pages = await discoverAllPages(ctx.checkoutPath)
  const page = pages.find(
    (p) => p.adapterId === adapterId && p.relativePath === relativePath,
  )
  if (!page) throw new Error('所选页面已不存在，请重新匹配')

  const outcome = await compareDesignWithPage(design, page)
  return {
    page: {
      adapterId: page.adapterId,
      kindLabel: page.kindLabel,
      relativePath: page.relativePath,
      precise: page.precise,
    },
    precise: outcome.precise,
    result: outcome.result,
    reason: outcome.reason,
  }
}
