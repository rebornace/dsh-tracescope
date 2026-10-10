import { useEffect, useRef, useState } from 'react'
import { getT, localeHeaders, withLocale } from '../locales/i18n.js'
import { useLocaleT } from '../locales/use-locale-t.js'
import { PageMappingOverview } from './PageMappingOverview.js'
import { DesignCompareBoard } from './DesignCompareBoard.js'
import { LoadingOverlay } from './LoadingOverlay.js'
import type { PageFindings } from './panel-types.js'

export type { PageFindings } from './panel-types.js'

interface DesignTreeLike {
  id: string
  name: string
  kind: string
  width: number
  height: number
  dynamic?: boolean
  itemRendered?: boolean
  inferredChildren?: unknown[]
  children?: DesignTreeLike[]
}

/** Dynamic/sparse regions for the AI fill-template prompt. */
function collectDynamicRegionsFromTree(root: DesignTreeLike | undefined): Array<{
  id: string
  name: string
  width: number
  height: number
  filled: boolean
  itemRendered: boolean
}> {
  if (!root) return []
  const out: Array<{
    id: string
    name: string
    width: number
    height: number
    filled: boolean
    itemRendered: boolean
  }> = []
  const walk = (n: DesignTreeLike): void => {
    if (n.dynamic || n.kind === 'dynamic') {
      out.push({
        id: n.id,
        name: n.name,
        width: Math.round(n.width),
        height: Math.round(n.height),
        filled: Boolean(n.inferredChildren?.length),
        itemRendered: Boolean(n.itemRendered),
      })
    }
    for (const c of n.children ?? []) walk(c)
  }
  walk(root)
  return out
}

async function post(path: string, body: unknown) {
  const r = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: localeHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify(withLocale(body)),
  })
  const text = await r.text()
  const data = text ? JSON.parse(text) : {}
  if (!r.ok) throw new Error(data.error || getT()('errors.requestFailed'))
  return data
}

export interface VisualComparePanelProps {
  repoInput: string
  auth?: unknown
  /** Drop a starter prompt into the host session composer (functional-test style). */
  onSendToChat?: (prompt: string) => { ok: boolean; error?: string }
  /**
   * Host-level confirm dialog (same dialog used by hand-test notes). Required for
   * reliable text input in the DSH sidebar — nested panel inputs often cannot focus.
   */
  openConfirmDialog?: (opts: {
    title: string
    message?: string
    inputLabel?: string
    inputValue?: string
    multiline?: boolean
    fields?: Array<{ key: string; label: string; value: string }>
    confirmLabel?: string
    onConfirm: (value: string | Record<string, string> | void) => void
  }) => void
  /** Collaboration platform readiness from host settings. */
  trackerReady?: boolean
  trackerProvider?: string
  /** Open host「仓库配置」so the user can finish tracker setup. */
  onOpenTrackerSettings?: () => void
}

// Persist design connection: URL may differ per code repo; Figma token / Lanhu
// cookie are design-platform credentials and resolve with per-repo override →
// global fallback so switching repos does not wipe a shared design login.
const UI_CONFIG_PREFIX = 'tracescope.ui.'
const UI_CONFIG_GLOBAL_PREFIX = 'tracescope.ui.global.'
const UI_CONFIG_FIGMA_URL = 'figmaUrl'
/** Figma personal access token (figd_…). Never store Lanhu cookies here. */
const UI_CONFIG_FIGMA_TOKEN = 'figmaToken'
/** Lanhu browser Cookie — kept separate so switching design sources does not clobber Figma. */
const UI_CONFIG_LANHU_COOKIE = 'lanhuCookie'
/** Whether adapter deep enrichment (e.g. Android XML layout engine) is enabled. */
const UI_CONFIG_DEEP_ENRICHMENT = 'deepEnrichment'
/** Saved design-link history (shared across repos). */
const SAVED_LINKS_KEY = 'tracescope.ui.savedFigmaLinks'
const MAX_SAVED_LINKS = 12

interface SavedFigmaLink {
  url: string
  label: string
  savedAt: string
}

function uiRepoKey(repoInput: string, field: string) {
  return UI_CONFIG_PREFIX + field + ':' + repoInput.trim()
}

function uiGlobalKey(field: string) {
  return UI_CONFIG_GLOBAL_PREFIX + field
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key: string, value: string) {
  try {
    if (value) localStorage.setItem(key, value)
    else localStorage.removeItem(key)
  } catch {
    /* storage unavailable: session-only */
  }
}

function readRepoUiConfig(repoInput: string, field: string): string {
  return readStorage(uiRepoKey(repoInput, field)) ?? ''
}

function readGlobalUiConfig(field: string): string {
  return readStorage(uiGlobalKey(field)) ?? ''
}

/**
 * Per-field resolve: non-empty repo override wins, else shared global.
 * Never treat "repo has some other field" as wiping this field.
 */
function resolveUiConfig(repoInput: string, field: string): string {
  const repoVal = readRepoUiConfig(repoInput, field).trim()
  if (repoVal) return repoVal
  return readGlobalUiConfig(field).trim()
}

/** Save both the current repo override and the shared global default. */
function writeUiConfig(repoInput: string, field: string, value: string) {
  const trimmed = value.trim()
  writeStorage(uiRepoKey(repoInput, field), trimmed)
  writeStorage(uiGlobalKey(field), trimmed)
}

function clearUiConfigField(repoInput: string, field: string) {
  writeStorage(uiRepoKey(repoInput, field), '')
  writeStorage(uiGlobalKey(field), '')
}

function readDeepEnrichmentEnabled(): boolean {
  const raw = readGlobalUiConfig(UI_CONFIG_DEEP_ENRICHMENT)
  if (raw === '0' || raw === 'false') return false
  return true
}

function writeDeepEnrichmentEnabled(enabled: boolean) {
  writeStorage(uiGlobalKey(UI_CONFIG_DEEP_ENRICHMENT), enabled ? '1' : '0')
}

function labelForDesignUrl(url: string): string {
  const t = getT()
  try {
    if (/lanhuapp\.com|lanhu\.woa\.com/i.test(url)) {
      const hashQ = url.includes('?') ? url.slice(url.indexOf('?') + 1) : ''
      const params = new URLSearchParams(hashQ.includes('#') ? hashQ.slice(hashQ.indexOf('?') + 1) : hashQ)
      // Hash routes: ...#/path?tid=...&image_id=...
      const fromHash = (() => {
        try {
          const u = new URL(url)
          const q = u.hash.includes('?') ? u.hash.slice(u.hash.indexOf('?') + 1) : u.search.slice(1)
          return new URLSearchParams(q)
        } catch {
          return params
        }
      })()
      const imageId = fromHash.get('image_id') || fromHash.get('imageId') || ''
      const projectId = fromHash.get('project_id') || fromHash.get('pid') || ''
      if (imageId) return t('visual.label.lanhuPage', { id: imageId.slice(0, 8) })
      if (projectId) return t('visual.label.lanhuProject', { id: projectId.slice(0, 8) })
      return t('visual.label.lanhuDesign')
    }
    const u = new URL(url)
    const parts = u.pathname.split('/').filter(Boolean)
    // /design/:fileKey/:fileName or /file/:fileKey/:fileName
    const name = parts.length >= 3 ? decodeURIComponent(parts[2]!.replace(/-/g, ' ')) : ''
    const node = u.searchParams.get('node-id') || ''
    if (name && node) return `${name} · node ${node}`
    if (name) return name
    if (node) return `node ${node}`
    return u.hostname + u.pathname
  } catch {
    return url.slice(0, 48)
  }
}

function isLikelyFigmaUrl(url: string): boolean {
  try {
    const u = new URL(url.trim())
    return u.hostname.includes('figma.com') && /\/(design|file|proto)\//.test(u.pathname)
  } catch {
    return false
  }
}

function isLikelyLanhuUrl(url: string): boolean {
  try {
    const host = new URL(url.trim()).hostname.toLowerCase()
    return host.includes('lanhuapp.com') || host.includes('lanhu.woa.com')
  } catch {
    return /lanhuapp\.com|lanhu\.woa\.com/i.test(url)
  }
}

function isLikelyDesignUrl(url: string): boolean {
  return isLikelyFigmaUrl(url) || isLikelyLanhuUrl(url)
}

function credentialFieldForUrl(url: string): string {
  return isLikelyLanhuUrl(url) ? UI_CONFIG_LANHU_COOKIE : UI_CONFIG_FIGMA_TOKEN
}

function looksLikeFigmaToken(value: string): boolean {
  return /^figd_/i.test(value.trim())
}

/** Heuristic: Lanhu cookies are long and usually contain "=" / ";". */
function looksLikeLanhuCookie(value: string): boolean {
  const v = value.trim()
  if (!v || looksLikeFigmaToken(v)) return false
  return /[;=]/.test(v) || v.length >= 64
}

/**
 * Resolve the credential for the current design URL.
 * Figma token and Lanhu cookie are stored under different keys so neither
 * overwrites the other when the user switches links. Each key falls back
 * from per-repo override → global (empty repo value does not hide global).
 */
function resolveDesignCredential(repoInput: string, url: string): string {
  const lanhu = isLikelyLanhuUrl(url)
  const field = lanhu ? UI_CONFIG_LANHU_COOKIE : UI_CONFIG_FIGMA_TOKEN
  const dedicated = resolveUiConfig(repoInput, field)

  if (lanhu) {
    if (dedicated.trim()) return dedicated
    // Legacy: cookie was saved under figmaToken — relocate once.
    const legacy = resolveUiConfig(repoInput, UI_CONFIG_FIGMA_TOKEN)
    if (legacy.trim() && looksLikeLanhuCookie(legacy)) {
      writeUiConfig(repoInput, UI_CONFIG_LANHU_COOKIE, legacy)
      return legacy
    }
    return ''
  }

  // Figma: only accept token-shaped values from the figmaToken key.
  if (dedicated.trim() && !looksLikeLanhuCookie(dedicated)) return dedicated
  if (dedicated.trim() && looksLikeLanhuCookie(dedicated)) {
    // Cookie was wrongly stored as figmaToken — move it to lanhuCookie.
    const existingLanhu = resolveUiConfig(repoInput, UI_CONFIG_LANHU_COOKIE)
    if (!existingLanhu.trim()) writeUiConfig(repoInput, UI_CONFIG_LANHU_COOKIE, dedicated)
    return ''
  }
  return ''
}

function readSavedLinks(): SavedFigmaLink[] {
  try {
    const raw = localStorage.getItem(SAVED_LINKS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as SavedFigmaLink[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter((x) => x && typeof x.url === 'string' && x.url.trim())
  } catch {
    return []
  }
}

function writeSavedLinks(list: SavedFigmaLink[]) {
  try {
    localStorage.setItem(SAVED_LINKS_KEY, JSON.stringify(list.slice(0, MAX_SAVED_LINKS)))
  } catch {
    /* ignore */
  }
}

/** Upsert a design URL into the saved-links list (most recent first). */
function rememberSavedLink(url: string): SavedFigmaLink[] {
  const trimmed = url.trim()
  if (!isLikelyDesignUrl(trimmed)) return readSavedLinks()
  const next: SavedFigmaLink[] = [
    { url: trimmed, label: labelForDesignUrl(trimmed), savedAt: new Date().toISOString() },
    ...readSavedLinks().filter((x) => x.url !== trimmed),
  ].slice(0, MAX_SAVED_LINKS)
  writeSavedLinks(next)
  return next
}

function removeSavedLink(url: string): SavedFigmaLink[] {
  const next = readSavedLinks().filter((x) => x.url !== url)
  writeSavedLinks(next)
  return next
}

export function VisualComparePanel({
  repoInput,
  auth,
  onSendToChat,
  openConfirmDialog,
  trackerReady,
  trackerProvider,
  onOpenTrackerSettings,
}: VisualComparePanelProps) {
  const t = useLocaleT()
  const [figmaUrl, setFigmaUrlState] = useState(() => resolveUiConfig(repoInput, UI_CONFIG_FIGMA_URL))
  const [figmaToken, setFigmaTokenState] = useState(() =>
    resolveDesignCredential(repoInput, resolveUiConfig(repoInput, UI_CONFIG_FIGMA_URL)),
  )
  const [deepEnrichment, setDeepEnrichmentState] = useState(() => readDeepEnrichmentEnabled())
  const [savedLinks, setSavedLinks] = useState<SavedFigmaLink[]>(() => readSavedLinks())
  const [busy, setBusy] = useState(false)
  const [busyMessage, setBusyMessage] = useState('')
  const [busyStartedAt, setBusyStartedAt] = useState(0)
  const [elapsed, setElapsed] = useState(0)

  // Begin/end a busy operation with a stage message. Both the whole-file scan
  // and high-fidelity compare route through here so the loading modal can show
  // what is happening and how long it has taken.
  function beginBusy(message: string) {
    setBusyMessage(message)
    setBusyStartedAt(Date.now())
    setElapsed(0)
    setBusy(true)
  }
  function endBusy() {
    setBusy(false)
    setBusyMessage('')
    setBusyStartedAt(0)
    setElapsed(0)
  }

  // Tick an elapsed-seconds counter while a busy operation runs.
  useEffect(() => {
    if (!busy || !busyStartedAt) return
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - busyStartedAt) / 1000)), 1000)
    return () => clearInterval(id)
  }, [busy, busyStartedAt])

  const [error, setError] = useState('')
  const [compareData, setCompareData] = useState<unknown>(null)
  // Design id + code file of the high-fidelity result currently shown, so the
  // originating card is highlighted and the result area is clearly labelled.
  const [activeDesignId, setActiveDesignId] = useState('')
  const [activeCodeFile, setActiveCodeFile] = useState<{ adapterId: string; relativePath: string } | null>(null)
  // AI findings per design id (write-back); persisted server-side.
  const [findingsMap, setFindingsMap] = useState<Record<string, PageFindings>>({})
  // Job currently awaiting the model's publish, plus the page it belongs to.
  const [pendingJob, setPendingJob] = useState<{
    jobId: string
    designId: string
    kind: 'findings' | 'rematch'
  } | null>(null)
  const [rematchApply, setRematchApply] = useState<{
    designId: string
    candidates: Array<{
      adapterId: string
      relativePath: string
      kindLabel?: string
      score?: number
      reason?: string
    }>
    note?: string
    token: number
  } | null>(null)
  const rematchTokenRef = useRef(0)

  const setFigmaUrl = (value: string) => {
    const next = value.trim()
    const prevLanhu = isLikelyLanhuUrl(figmaUrl)
    const nextLanhu = isLikelyLanhuUrl(next)
    setFigmaUrlState(value)
    writeUiConfig(repoInput, UI_CONFIG_FIGMA_URL, next)
    // When switching Figma ↔ 蓝湖, show the credential stored for that source
    // (do not wipe the other key).
    if (prevLanhu !== nextLanhu) {
      setFigmaTokenState(resolveDesignCredential(repoInput, next))
    }
  }
  const setFigmaToken = (value: string) => {
    setFigmaTokenState(value)
    writeUiConfig(repoInput, credentialFieldForUrl(figmaUrl), value.trim())
  }
  const clearFigmaUrl = () => {
    setFigmaUrlState('')
    clearUiConfigField(repoInput, UI_CONFIG_FIGMA_URL)
  }
  const clearFigmaToken = () => {
    setFigmaTokenState('')
    clearUiConfigField(repoInput, credentialFieldForUrl(figmaUrl))
  }
  const setDeepEnrichment = (enabled: boolean) => {
    setDeepEnrichmentState(enabled)
    writeDeepEnrichmentEnabled(enabled)
  }
  const saveCurrentLink = () => {
    if (!figmaUrl.trim()) return
    setSavedLinks(rememberSavedLink(figmaUrl))
  }
  const applySavedLink = (url: string) => {
    setFigmaUrl(url)
  }
  const deleteSavedLink = (url: string) => {
    const next = removeSavedLink(url)
    setSavedLinks(next)
    if (figmaUrl.trim() === url.trim()) clearFigmaUrl()
  }
  const onDesignLinkUsed = (url: string) => {
    setSavedLinks(rememberSavedLink(url))
  }

  // When the code folder changes: prefer that repo's saved design URL when
  // present; credentials always fall back to global so the same design login
  // survives repo switches. Keep in-memory values when storage has nothing.
  useEffect(() => {
    const storedUrl = resolveUiConfig(repoInput, UI_CONFIG_FIGMA_URL)
    setFigmaUrlState((prev) => {
      const next = storedUrl || prev
      setFigmaTokenState((prevToken) => {
        const resolved = resolveDesignCredential(repoInput, next)
        // Prefer stored credential; only keep typed-but-unsaved token when
        // storage has nothing for this design source.
        return resolved || prevToken
      })
      return next
    })
    setError('')
    setCompareData(null)
    setActiveDesignId('')
    setActiveCodeFile(null)
    setFindingsMap({})
    setPendingJob(null)
    setRematchApply(null)
  }, [repoInput])

  // Poll the UI review / rematch job once the prompt is in the composer.
  useEffect(() => {
    if (!pendingJob) return
    let timer: ReturnType<typeof setTimeout> | null = null
    let cancelled = false
    const startedAt = Date.now()
    const MAX_WAIT_MS = 180_000
    const tick = async () => {
      try {
        const res = await post('/tracescope/v1/visual-job', { id: pendingJob.jobId })
        if (cancelled) return
        const status = (res as { status?: string }).status
        if (status === 'published') {
          if (pendingJob.kind === 'rematch') {
            const rematch = (
              res as {
                rematch?: {
                  picks?: Array<{
                    adapterId?: string
                    relativePath?: string
                    kindLabel?: string
                    score?: number
                    reason?: string
                  }>
                  note?: string
                }
              }
            ).rematch
            const picks = (rematch?.picks ?? [])
              .filter((p) => p && p.relativePath)
              .map((p) => ({
                adapterId: String(p.adapterId || 'android-xml'),
                relativePath: String(p.relativePath),
                kindLabel: p.kindLabel,
                score: p.score,
                reason: p.reason,
              }))
            if (picks.length) {
              rematchTokenRef.current += 1
              setRematchApply({
                designId: pendingJob.designId,
                candidates: picks,
                note: rematch?.note,
                token: rematchTokenRef.current,
              })
              setError(
                t('visual.success.fileRematchWriteback', { path: picks[0]!.relativePath }),
              )
            }
          } else {
            const findings = (res as { findings?: PageFindings }).findings
            if (findings) {
              setFindingsMap((prev) => ({
                ...prev,
                [pendingJob.designId]: {
                  findings: findings.findings ?? [],
                  renderPatch: findings.renderPatch,
                  summary: findings.summary,
                  savedAt: findings.savedAt || new Date().toISOString(),
                },
              }))
            }
          }
          setPendingJob(null)
          return
        }
        if (status === 'error') {
          setPendingJob(null)
          return
        }
      } catch {
        /* transient: keep polling */
      }
      if (cancelled) return
      if (Date.now() - startedAt > MAX_WAIT_MS) {
        setPendingJob(null)
        return
      }
      timer = setTimeout(tick, 2000)
    }
    timer = setTimeout(tick, 2500)
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [pendingJob])

  /** Build a page-specific design URL (Figma node-id or Lanhu image_id). */
  function nodeUrl(designId: string): string {
    const id = designId.trim()
    if (!id) return figmaUrl
    if (isLikelyLanhuUrl(figmaUrl)) {
      try {
        const u = new URL(figmaUrl.trim())
        const host = u.hostname.toLowerCase().includes('woa') ? 'lanhu.woa.com' : 'lanhuapp.com'
        const hashQ = u.hash.includes('?') ? u.hash.slice(u.hash.indexOf('?') + 1) : u.search.slice(1)
        const params = new URLSearchParams(hashQ)
        const projectId = params.get('project_id') || params.get('pid') || ''
        const tid = params.get('tid') || params.get('team_id') || '0'
        if (!projectId) return figmaUrl
        const q = new URLSearchParams({
          tid,
          pid: projectId,
          project_id: projectId,
          image_id: id,
        })
        return `https://${host}/web/#/item/project/detailDetach?${q.toString()}`
      } catch {
        return figmaUrl
      }
    }
    try {
      const u = new URL(figmaUrl)
      u.searchParams.set('node-id', id.replace(/:/g, '-'))
      return u.toString()
    } catch {
      return figmaUrl
    }
  }

  /**
   * Run high-fidelity compare for one design↔code pair and wire the board.
   * Does not manage busy overlay — callers own beginBusy/endBusy.
   */
  async function runDesignCompare(
    designId: string,
    codeFile: { adapterId: string; relativePath: string },
    force = false,
  ): Promise<
    { ok: true; designImageUrl?: string } | { ok: false; error: string }
  > {
    try {
      const res = await post('/tracescope/v1/design-compare', {
        repoPath: repoInput,
        auth,
        figmaUrl: nodeUrl(designId),
        figmaToken: figmaToken.trim(),
        designId,
        adapterId: codeFile.adapterId,
        relativePath: codeFile.relativePath,
        useAI: false,
        force,
        enrichment: deepEnrichment,
      })
      setCompareData(res)
      setActiveDesignId(designId)
      setActiveCodeFile(codeFile)
      try {
        const f = await post('/tracescope/v1/visual-findings-load', {
          repoPath: repoInput,
          figmaUrl: nodeUrl(designId),
          designId,
          adapterId: codeFile.adapterId,
          relativePath: codeFile.relativePath,
        })
        const report = (f as { found?: boolean; report?: PageFindings }).report
        if ((f as { found?: boolean }).found && report) {
          setFindingsMap((prev) => ({
            ...prev,
            [designId]: {
              findings: report.findings ?? [],
              renderPatch: report.renderPatch,
              summary: report.summary,
              savedAt: report.savedAt || new Date().toISOString(),
            },
          }))
        }
      } catch {
        /* findings are optional */
      }
      return {
        ok: true,
        designImageUrl: (res as { designImageUrl?: string }).designImageUrl,
      }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  }

  async function compareFromOverview(
    designId: string,
    codeFile: { adapterId: string; relativePath: string },
    force = false,
  ) {
    setError('')
    setCompareData(null)
    setActiveDesignId('')
    setActiveCodeFile(null)
    beginBusy(force ? t('visual.busy.regenerateCompare') : t('visual.busy.compare'))
    try {
      const result = await runDesignCompare(designId, codeFile, force)
      if (!result.ok) setError(result.error)
      else if (!result.designImageUrl) {
        setError(t('visual.error.compareDoneNoRaster'))
      }
    } finally {
      endBusy()
    }
  }

  /**
   * Per-card "AI 协助分析": ensure the design-compare board is showing for this page
   * (so design raster + static diffs are visible), then fill the session
   * composer with the skill-driven analysis brief.
   */
  async function aiAnalyzeFromOverview(
    designId: string,
    codeFile: { adapterId: string; relativePath: string },
  ) {
    setError('')
    const boardReady =
      !!compareData &&
      activeDesignId === designId &&
      activeCodeFile?.adapterId === codeFile.adapterId &&
      activeCodeFile?.relativePath === codeFile.relativePath

    if (!boardReady) {
      const proceed = window.confirm(t('visual.confirm.noCompareYet'))
      if (!proceed) {
        setError(t('visual.error.aiAnalyzeCancelled'))
        return
      }
    }

    beginBusy(boardReady ? t('visual.busy.preparingAi') : t('visual.busy.compareThenAi'))
    try {
      let designImageUrl =
        boardReady
          ? (compareData as { designImageUrl?: string } | null)?.designImageUrl
          : undefined

      if (!boardReady) {
        const compared = await runDesignCompare(designId, codeFile, false)
        if (!compared.ok) {
          setError(t('visual.error.compareFailedAbort', { reason: compared.error }))
          return
        }
        designImageUrl = compared.designImageUrl
        setBusyMessage(t('visual.busy.preparingAi'))
      }

      if (!designImageUrl) {
        const proceedWithoutRaster = window.confirm(t('visual.confirm.noRaster'))
        if (!proceedWithoutRaster) {
          setError(t('visual.error.cancelNeedRaster'))
          return
        }
      }

      const res = await post('/tracescope/v1/code-visual-prompt', {
        repoPath: repoInput,
        auth,
        figmaUrl: nodeUrl(designId),
        figmaToken: figmaToken.trim(),
        designId,
        adapterId: codeFile.adapterId,
        relativePath: codeFile.relativePath,
        dynamicRegions: collectDynamicRegionsFromTree(
          (compareData as { codeTree?: DesignTreeLike } | null)?.codeTree,
        ),
      })
      const prompt = (res as { prompt?: string }).prompt
      const jobId = (res as { jobId?: string }).jobId
      const promptDesignImage = (res as { designImageUrl?: string }).designImageUrl
      const designRasterInPanel = Boolean(
        (res as { designRasterInPanel?: boolean }).designRasterInPanel ||
          designImageUrl ||
          promptDesignImage,
      )
      if (!designRasterInPanel) {
        const proceed = window.confirm(t('visual.confirm.promptNoRaster'))
        if (!proceed) {
          setError(t('visual.error.cancelPrompt'))
          return
        }
      }
      if (typeof onSendToChat !== 'function' || !prompt) {
        setError(t('visual.error.cannotPrepareAi'))
        return
      }
      const sent = onSendToChat(prompt)
      if (!sent.ok) {
        setError((sent.error || t('errors.cannotWriteChat')) + t('visual.error.chatWriteSuffix'))
        return
      }
      if (jobId) setPendingJob({ jobId, designId, kind: 'findings' })
      setError(
        designRasterInPanel ? t('visual.success.aiPromptSent') : t('visual.success.aiPromptSentNoRaster'),
      )
    } catch (err) {
      setError((err as Error).message)
    } finally {
      endBusy()
    }
  }

  /**
   * Per-card "AI 推荐文件": build a reviewable rematch prompt (static candidates
   * + design texts) and fill the session composer. No silent LLM call — the
   * user can edit, send, and keep chatting to correct bad matches.
   */
  async function aiRematchFromOverview(
    designId: string,
    codeFile?: { adapterId: string; relativePath: string },
  ) {
    setError('')
    beginBusy(t('visual.busy.preparingRematch'))
    try {
      if (!figmaUrl.trim() || !figmaToken.trim()) {
        setError(t('visual.error.needCredentials'))
        return
      }
      const res = await post('/tracescope/v1/match-page', {
        repoPath: repoInput,
        auth,
        figmaUrl: figmaUrl.trim(),
        figmaToken: figmaToken.trim(),
        designId,
        rematchPrompt: true,
        adapterId: codeFile?.adapterId,
        relativePath: codeFile?.relativePath,
      })
      const prompt = (res as { prompt?: string }).prompt
      const jobId = (res as { jobId?: string }).jobId
      if (typeof onSendToChat !== 'function' || !prompt) {
        setError(t('visual.error.cannotPrepareRematch'))
        return
      }
      const sent = onSendToChat(prompt)
      if (!sent.ok) {
        setError((sent.error || t('errors.cannotWriteChat')) + t('visual.error.rematchChatWriteSuffix'))
        return
      }
      if (jobId) setPendingJob({ jobId, designId, kind: 'rematch' })
      setError(t('visual.success.rematchPrompt'))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      endBusy()
    }
  }

  return (
    <section style={S.card}>
      {busy ? (
        <LoadingOverlay message={busyMessage} elapsedSeconds={elapsed} />
      ) : null}
      <strong>
        {t('visual.title')}
        <span
          style={{
            marginLeft: 8,
            fontSize: 10,
            fontWeight: 700,
            color: '#8a5a00',
            background: '#fff4d6',
            border: '1px solid #f0d48a',
            borderRadius: 4,
            padding: '1px 6px',
            verticalAlign: 'middle',
          }}
        >
          {t('visual.experimental')}
        </span>
      </strong>
      <p style={S.hint}>{t('visual.intro')}</p>

      <label style={S.label}>
        {t('visual.designLinkLabel')}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            style={{ ...S.input, flex: 1, marginTop: 0 }}
            value={figmaUrl}
            disabled={busy}
            placeholder={t('visual.designLinkPlaceholder')}
            onChange={(e) => setFigmaUrl(e.target.value)}
            onBlur={() => {
              if (isLikelyDesignUrl(figmaUrl)) setSavedLinks(rememberSavedLink(figmaUrl))
            }}
          />
          <button
            type="button"
            style={S.miniBtn}
            disabled={busy || !figmaUrl.trim()}
            title={t('visual.saveLinkTitle')}
            onClick={saveCurrentLink}
          >
            {t('visual.saveLink')}
          </button>
          <button
            type="button"
            style={S.miniBtn}
            disabled={busy || !figmaUrl.trim()}
            title={t('visual.clearLinkTitle')}
            onClick={clearFigmaUrl}
          >
            {t('visual.deleteLink')}
          </button>
        </div>
      </label>

      {savedLinks.length > 0 ? (
        <div style={{ margin: '0 0 8px', fontSize: 12 }}>
          <div style={{ color: '#667085', marginBottom: 4 }}>{t('visual.savedLinksHeading')}</div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 }}>
            {savedLinks.map((item) => {
              const active = item.url.trim() === figmaUrl.trim()
              return (
                <li
                  key={item.url}
                  style={{
                    display: 'flex',
                    gap: 6,
                    alignItems: 'center',
                    padding: '4px 6px',
                    borderRadius: 6,
                    background: active ? '#eef6ff' : '#f8fafc',
                    border: `1px solid ${active ? '#b2d4ff' : '#e4e7ec'}`,
                  }}
                >
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => applySavedLink(item.url)}
                    title={item.url}
                    style={{
                      flex: 1,
                      textAlign: 'left',
                      border: 'none',
                      background: 'transparent',
                      cursor: busy ? 'default' : 'pointer',
                      padding: 0,
                      fontSize: 12,
                      color: '#101828',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {item.label || item.url}
                  </button>
                  <button
                    type="button"
                    style={S.miniBtn}
                    disabled={busy}
                    title={t('visual.removeSavedLinkTitle')}
                    onClick={() => deleteSavedLink(item.url)}
                  >
                    ×
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}

      <label style={S.label}>
        {isLikelyLanhuUrl(figmaUrl) ? t('visual.lanhuCookie') : t('visual.figmaToken')}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            style={{ ...S.input, flex: 1, marginTop: 0 }}
            type="password"
            value={figmaToken}
            disabled={busy}
            placeholder={
              isLikelyLanhuUrl(figmaUrl)
                ? t('visual.lanhuCookiePlaceholder')
                : t('visual.figmaTokenPlaceholder')
            }
            onChange={(e) => setFigmaToken(e.target.value)}
          />
          <button
            type="button"
            style={S.miniBtn}
            disabled={busy || !figmaToken.trim()}
            title={
              isLikelyLanhuUrl(figmaUrl)
                ? t('visual.clearLanhuCookieTitle')
                : t('visual.clearFigmaTokenTitle')
            }
            onClick={clearFigmaToken}
          >
            {t('visual.clearCredential')}
          </button>
        </div>
      </label>

      <label
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 8,
          margin: '0 0 10px',
          fontSize: 12,
          color: '#344054',
          lineHeight: 1.45,
          cursor: busy ? 'default' : 'pointer',
        }}
      >
        <input
          type="checkbox"
          checked={deepEnrichment}
          disabled={busy}
          style={{ marginTop: 2 }}
          onChange={(e) => setDeepEnrichment(e.target.checked)}
        />
        <span>
          <b>{t('visual.deepEnrichmentTitle')}</b>
          {t('visual.deepEnrichmentBody')}
        </span>
      </label>

      <p style={{ ...S.hint, margin: '2px 0 8px' }}>{t('visual.workflowHint')}</p>

      {error ? (
        <p
          style={{
            color: error.startsWith('✓') ? '#0f6e56' : '#b42318',
            margin: '0 0 8px',
            fontSize: 12,
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
          }}
        >
          {error}
        </p>
      ) : null}

      <div style={{ marginTop: 2 }}>
        <PageMappingOverview
          repoInput={repoInput}
          figmaUrl={figmaUrl}
          figmaToken={figmaToken}
          auth={auth}
          busy={busy}
          activeDesignId={activeDesignId}
          onScanStateChange={(next, message) =>
            next ? beginBusy(message || t('visual.busy.scanDesign')) : endBusy()
          }
          onDesignLinkUsed={onDesignLinkUsed}
          onCompare={compareFromOverview}
          onAiAnalyze={aiAnalyzeFromOverview}
          onAiRematch={aiRematchFromOverview}
          rematchApply={rematchApply}
        />
      </div>

      {compareData ? (
        <div
          style={{
            marginTop: 14,
            padding: '10px 12px',
            border: '1px solid #0f6e56',
            borderRadius: 10,
            background: '#f2f8f5',
            fontSize: 12,
            color: '#0d4a3a',
            lineHeight: 1.6,
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 13 }}>
            {t('visual.currentCompare', {
              name: String(
                (compareData as { designTree?: { name?: string } })?.designTree?.name ?? '',
              ),
            })}
          </div>
          <div style={{ marginTop: 2, color: '#3f6b5c', wordBreak: 'break-all' }}>
            {t('visual.currentCompareFiles', {
              path:
                (activeCodeFile as { relativePath?: string } | null)?.relativePath ??
                (compareData as { page?: { relativePath?: string } })?.page?.relativePath ??
                '',
            })}
          </div>
        </div>
      ) : null}
      {compareData ? (
        <DesignCompareBoard
          data={compareData as never}
          findings={
            activeDesignId ? (findingsMap[activeDesignId] as PageFindings) : undefined
          }
          onSendToChat={onSendToChat}
          openConfirmDialog={openConfirmDialog}
          repoInput={repoInput}
          designUrl={figmaUrl}
          trackerReady={trackerReady}
          trackerProvider={trackerProvider}
          onOpenTrackerSettings={onOpenTrackerSettings}
          onActionHint={(message) => setError(message)}
          onAiAnalyze={(file) => {
            const designId = String(
              (compareData as { designTree?: { id?: string } } | null)?.designTree?.id ?? '',
            )
            if (designId) aiAnalyzeFromOverview(designId, file)
            else setError(t('visual.error.noDesignNode'))
          }}
          onRegenerate={() => {
            const tree = (compareData as {
              designTree?: { id?: string }
              page?: { adapterId?: string; relativePath?: string }
            } | null)
            const designId = String(tree?.designTree?.id ?? '')
            const adapterId = String(tree?.page?.adapterId ?? '')
            const relativePath = String(tree?.page?.relativePath ?? '')
            if (designId && adapterId && relativePath) {
              void compareFromOverview(designId, { adapterId, relativePath }, true)
            } else {
              setError(t('visual.error.noPage'))
            }
          }}
        />
      ) : null}
    </section>
  )
}

const S = {
  card: {
    border: '1px solid var(--dsh-border,#ddd4c5)',
    borderRadius: 12,
    background: '#fff',
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
  },
  hint: { margin: '4px 0 10px', color: '#6b645a', fontSize: 12, lineHeight: 1.5 },
  label: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, marginBottom: 10 },
  input: {
    width: '100%',
    padding: '6px 8px',
    border: '1px solid var(--dsh-border,#d8d0c2)',
    borderRadius: 8,
    fontSize: 13,
    boxSizing: 'border-box',
  },
  miniBtn: {
    flexShrink: 0,
    padding: '6px 10px',
    borderRadius: 8,
    border: '1px solid #d0d5dd',
    background: '#fff',
    color: '#344054',
    fontSize: 12,
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  },
  primary: {
    padding: '7px 12px',
    borderRadius: 8,
    border: '1px solid #0f6e56',
    background: '#0f6e56',
    color: '#fff',
    fontWeight: 600,
    cursor: 'pointer',
  },
  row: { display: 'flex', alignItems: 'center', gap: 8 },
  badge: {
    fontSize: 11,
    color: '#9a6700',
    background: '#fef0c7',
    borderRadius: 999,
    padding: '1px 7px',
  },
}

