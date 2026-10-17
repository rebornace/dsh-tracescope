import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { existsSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildAndroidResources,
  compareVisualDocs,
  exportReportCsv,
  exportReportMarkdown,
  fetchFigmaDoc,
  normalizeAndroidLayout,
  normalizeUIKitDoc,
  parseGitAuth,
  EMPTY_ANDROID_RESOURCES,
  type AndroidResources,
  type ImpactReport,
} from '@rebornace/tracescope-core'
import { parseFetchFlag } from './http/route-helpers.js'
import { createStandaloneHost, type StandaloneHost } from './http/standalone-host.js'
import { registerPanelHttpRoutes } from './http/register-panel-routes.js'
import { langFromBody, langFromRequest } from './i18n/lang.js'
import { localizeError, msg } from './i18n/messages.js'
import { loadCodeupHistory, loadRepoHistory } from './services/repo-history.js'
import { runAnalyze } from './services/run-analyze.js'
import { resolveCodeupAuth, resolveRequestGitAuth } from './services/request-auth.js'
import { writeReportExports } from './services/write-report-exports.js'

const DEFAULT_PORT = 3927

/** Present in the CJS Desktop host bundle; absent in ESM `tsc` emit. */
declare const __dirname: string | undefined

export interface PanelServerHandle {
  port: number
  url: string
  close: () => Promise<void>
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  })
  res.end(json)
}

function sendLocalizedError(
  req: IncomingMessage,
  res: ServerResponse,
  status: number,
  error: unknown,
  body?: Record<string, unknown>,
): void {
  const acceptLang = langFromRequest(req)
  const lang = body ? langFromBody(body, acceptLang) : acceptLang
  sendJson(res, status, localizeError(error, lang))
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf8')
}

function contentType(filePath: string): string {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8'
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8'
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8'
  if (filePath.endsWith('.svg')) return 'image/svg+xml'
  return 'application/octet-stream'
}

/** Walk up from a layout file to find the Android module root (dir containing `res/`). */
async function findAndroidResRoot(layoutPath: string): Promise<string | undefined> {
  let dir = path.dirname(layoutPath)
  for (let i = 0; i < 8; i++) {
    const resDir = path.join(dir, 'src', 'main', 'res')
    try {
      const stat = await readdir(resDir)
      if (stat.length) return path.join(dir, 'src', 'main')
    } catch {
      /* not here */
    }
    // Also accept a direct `res/` layout (res/layout/*.xml).
    if (path.basename(dir) === 'res') {
      const parent = path.dirname(dir)
      try {
        await readdir(dir)
        return parent
      } catch {
        /* ignore */
      }
    }
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return undefined
}

/** Read every values* XML (dimens/colors) reachable under an Android res root. */
async function discoverAndroidResources(resRoot: string): Promise<AndroidResources> {
  const resDir = path.join(resRoot, 'res')
  let valueDirs: string[] = []
  try {
    valueDirs = (await readdir(resDir, { withFileTypes: true }))
      .filter((d) => d.isDirectory() && /^values/.test(d.name))
      .map((d) => path.join(resDir, d.name))
  } catch {
    return { ...EMPTY_ANDROID_RESOURCES }
  }
  const files: string[] = []
  for (const dir of valueDirs) {
    let entries: string[] = []
    try {
      entries = await readdir(dir)
    } catch {
      continue
    }
    for (const name of entries) {
      if (name.endsWith('.xml')) {
        files.push(await readFile(path.join(dir, name), 'utf8'))
      }
    }
  }
  return buildAndroidResources(...files)
}

function inferCodeKind(codePath: string): 'android-xml' | 'uikit' {
  if (/\.(xib|storyboard)$/i.test(codePath)) return 'uikit'
  return 'android-xml'
}

async function handleApi(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<boolean> {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    })
    res.end()
    return true
  }

  if (url.pathname === '/api/health' && req.method === 'GET') {
    sendJson(res, 200, { ok: true, name: 'tracescope-panel' })
    return true
  }

  if (url.pathname === '/api/commits' && req.method === 'POST') {
    let body: Record<string, unknown> = {}
    try {
      const raw = await readBody(req)
      body = JSON.parse(raw || '{}') as Record<string, unknown>
      const parsed = body as {
        repoPath?: string
        limit?: number
        fetch?: boolean | string
        refName?: string
        auth?: unknown
        accessMode?: string
        codeup?: {
          endpoint?: string
          token?: string
          organizationId?: string
          repositoryId?: string
        }
      }
      const repoPath = String(parsed.repoPath ?? '')
      const limit = Number(parsed.limit ?? 40)
      const refName = typeof parsed.refName === 'string' ? parsed.refName.trim() : ''
      const lang = langFromBody(body, langFromRequest(req))
      if (!repoPath) {
        sendJson(res, 400, {
          error: msg('ERR_MISSING_REPO_PATH', lang),
          code: 'ERR_MISSING_REPO_PATH',
        })
        return true
      }
      const fetchRemote = parseFetchFlag(parsed.fetch, true)
      if (parsed.accessMode === 'codeup') {
        const codeup = await resolveCodeupAuth({
          accessMode: 'codeup',
          codeup: (parsed.codeup as Record<string, unknown>) ?? {},
        })
        const history = await loadCodeupHistory(
          repoPath,
          Number.isFinite(limit) ? limit : 40,
          codeup,
          refName || undefined,
        )
        sendJson(res, 200, history)
        return true
      }
      const auth = await resolveRequestGitAuth(parseGitAuth(parsed.auth), repoPath)
      const history = await loadRepoHistory(
        repoPath,
        Number.isFinite(limit) ? limit : 40,
        fetchRemote,
        auth,
        refName || undefined,
      )
      sendJson(res, 200, history)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      const lang = langFromBody(body, langFromRequest(req))
      sendJson(res, 400, {
        ...localizeError(new Error(`无法读取 git 历史：${message}`), lang),
      })
    }
    return true
  }

  if (url.pathname === '/api/commits' && req.method === 'GET') {
    const repoPath = url.searchParams.get('repoPath') ?? ''
    const limit = Number(url.searchParams.get('limit') ?? '40')
    const lang = langFromBody(
      Object.fromEntries(url.searchParams.entries()),
      langFromRequest(req),
    )
    if (!repoPath) {
      sendJson(res, 400, {
        error: msg('ERR_MISSING_REPO_PATH', lang),
        code: 'ERR_MISSING_REPO_PATH',
      })
      return true
    }
    try {
      const fetchRemote = parseFetchFlag(url.searchParams.get('fetch'), true)
      const history = await loadRepoHistory(
        repoPath,
        Number.isFinite(limit) ? limit : 40,
        fetchRemote,
        undefined,
      )
      sendJson(res, 200, {
        resolved: history.resolved,
        commits: history.commits,
        refs: history.refs,
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      sendJson(res, 400, {
        ...localizeError(new Error(`无法读取 git 历史：${message}`), lang),
      })
    }
    return true
  }

  if (url.pathname === '/api/analyze' && req.method === 'POST') {
    let body: Record<string, unknown> = {}
    try {
      const raw = await readBody(req)
      body = JSON.parse(raw) as Record<string, unknown>
      const repoPath = String(body.repoPath ?? '')
      const baseCommit = String(body.baseCommit ?? '')
      const headCommit = String(body.headCommit ?? '')
      const lang = langFromBody(body, langFromRequest(req))
      if (!repoPath || !baseCommit || !headCommit) {
        sendJson(res, 400, {
          error: msg('ERR_MISSING_REPO_COMMITS', lang),
          code: 'ERR_MISSING_REPO_COMMITS',
        })
        return true
      }
      const accessMode = body.accessMode === 'codeup' ? 'codeup' : 'git'
      const result = await runAnalyze({
        repoPath,
        baseCommit,
        headCommit,
        rippleDepth: typeof body.rippleDepth === 'number' ? body.rippleDepth : undefined,
        modulesConfigPath:
          typeof body.modulesConfigPath === 'string' ? body.modulesConfigPath : undefined,
        exportDir: typeof body.exportDir === 'string' ? body.exportDir : undefined,
        fetchRemote:
          body.fetchRemote !== undefined || body.fetch !== undefined
            ? parseFetchFlag(body.fetchRemote ?? body.fetch, false)
            : undefined,
        auth: await resolveRequestGitAuth(parseGitAuth(body.auth), repoPath),
        accessMode,
        codeup: accessMode === 'codeup' ? await resolveCodeupAuth(body) : undefined,
        persist: false,
      })
      sendJson(res, 200, {
        report: result.report,
        markdown: result.markdown,
        csv: result.csv,
      })
    } catch (error: unknown) {
      sendLocalizedError(req, res, 400, error, body)
    }
    return true
  }

  if (url.pathname === '/api/export' && req.method === 'POST') {
    let body: Record<string, unknown> = {}
    try {
      const raw = await readBody(req)
      body = JSON.parse(raw) as Record<string, unknown>
      const exportDir = typeof body.exportDir === 'string' ? body.exportDir : ''
      const report = body.report as ImpactReport | undefined
      const lang = langFromBody(body, langFromRequest(req))
      if (!exportDir || !report) {
        sendJson(res, 400, {
          error: msg('ERR_MISSING_EXPORT_REPORT', lang),
          code: 'ERR_MISSING_EXPORT_REPORT',
        })
        return true
      }
      const markdown = exportReportMarkdown(report)
      const csv = exportReportCsv(report)
      await writeReportExports(exportDir, markdown, csv)
      sendJson(res, 200, {
        ok: true,
        files: [
          path.join(exportDir, 'tracescope-report.md'),
          path.join(exportDir, 'tracescope-report.csv'),
        ],
      })
    } catch (error: unknown) {
      sendLocalizedError(req, res, 400, error, body)
    }
    return true
  }

  if (url.pathname === '/api/visual-compare' && req.method === 'POST') {
    let body: Record<string, unknown> = {}
    try {
      const raw = await readBody(req)
      body = JSON.parse(raw || '{}') as Record<string, unknown>
      const figmaUrl = String(body.figmaUrl ?? '').trim()
      const figmaToken = String(body.figmaToken ?? '').trim()
      const codePath = String(body.codePath ?? '').trim()
      const lang = langFromBody(body, langFromRequest(req))
      if (!figmaUrl || !figmaToken) {
        sendJson(res, 400, {
          error: msg('ERR_FIGMA_TOKEN_REQUIRED', lang),
          code: 'ERR_FIGMA_TOKEN_REQUIRED',
        })
        return true
      }
      if (!codePath) {
        sendJson(res, 400, {
          error: msg('ERR_CODE_LAYOUT_PATH_REQUIRED', lang),
          code: 'ERR_CODE_LAYOUT_PATH_REQUIRED',
        })
        return true
      }
      if (!existsSync(codePath)) {
        sendJson(res, 400, {
          error: msg('ERR_CODE_FILE_NOT_FOUND', lang, { path: codePath }),
          code: 'ERR_CODE_FILE_NOT_FOUND',
        })
        return true
      }

      const design = await fetchFigmaDoc(figmaUrl, undefined, { token: figmaToken })
      const codeXml = await readFile(codePath, 'utf8')
      const kind = inferCodeKind(codePath)

      let resources: AndroidResources = { ...EMPTY_ANDROID_RESOURCES }
      let resolvedResRoot: string | undefined
      if (kind === 'android-xml') {
        resolvedResRoot = await findAndroidResRoot(codePath)
        if (resolvedResRoot) resources = await discoverAndroidResources(resolvedResRoot)
      }

      const code =
        kind === 'uikit'
          ? normalizeUIKitDoc(codeXml)
          : normalizeAndroidLayout(codeXml, resources)

      const result = compareVisualDocs(design, code)
      sendJson(res, 200, {
        result,
        codeKind: kind,
        resRoot: resolvedResRoot,
        resourceCounts: {
          dimens: Object.keys(resources.dimens).length,
          colors: Object.keys(resources.colors).length,
        },
      })
    } catch (error: unknown) {
      sendLocalizedError(req, res, 400, error, body)
    }
    return true
  }

  return false
}

function getStartDir(): string {
  // CJS Desktop host bundle provides __dirname; native ESM uses import.meta.url.
  // Do not evaluate import.meta via a dynamic code constructor (marketplace scanners flag it).
  if (typeof __dirname === 'string' && __dirname.length > 0) return __dirname
  return path.dirname(fileURLToPath(import.meta.url))
}

function panelStaticRoot(): string {
  // Walk up from lib/ or dist/ until we find package-local panel/index.html
  let dir = getStartDir()
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(dir, 'panel', 'index.html')
    if (existsSync(candidate)) return path.join(dir, 'panel')
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  throw new Error(`[tracescope] panel assets not found (startDir=${getStartDir()})`)
}

let sharedPanel: PanelServerHandle | null = null
let sharedHost: StandaloneHost | null = null

export async function startPanelServer(port = DEFAULT_PORT): Promise<PanelServerHandle> {
  if (sharedPanel) return sharedPanel

  const staticRoot = panelStaticRoot()
  const hostApi = createStandaloneHost()
  registerPanelHttpRoutes(hostApi.ctx)
  sharedHost = hostApi

  const server: Server = createServer(async (req, res) => {
    try {
      const host = req.headers.host ?? `127.0.0.1:${port}`
      const url = new URL(req.url ?? '/', `http://${host}`)

      // Full workbench APIs (same handlers as DSH sidebar).
      if (url.pathname.startsWith('/tracescope/v1/')) {
        if (await hostApi.dispatch(req, res)) return
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' }).end(
          JSON.stringify({ error: 'not found', path: url.pathname }),
        )
        return
      }

      // Legacy /api/* kept briefly for old bookmarks; prefer the SPA + v1 routes.
      if (await handleApi(req, res, url)) return

      let rel = url.pathname === '/' ? '/index.html' : url.pathname
      rel = path.normalize(rel).replace(/^(\.\.[/\\])+/, '')
      const filePath = path.join(staticRoot, rel)
      if (!filePath.startsWith(staticRoot)) {
        res.writeHead(403).end('Forbidden')
        return
      }
      // SPA fallback: unknown extensionless paths → index.html
      let servePath = filePath
      let data: Buffer
      try {
        data = await readFile(filePath)
      } catch (err) {
        if ((err as NodeJS.ErrnoException)?.code === 'ENOENT' && !path.basename(rel).includes('.')) {
          servePath = path.join(staticRoot, 'index.html')
          data = await readFile(servePath)
        } else {
          throw err
        }
      }
      res.writeHead(200, { 'Content-Type': contentType(servePath) })
      res.end(data)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
        res.writeHead(404).end('Not Found')
        return
      }
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }).end(message)
    }
  })

  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      // Loopback-only bind: never expose the panel on LAN / 0.0.0.0.
      server.listen(port, '127.0.0.1', () => resolve())
    })
  } catch (error: unknown) {
    const code = (error as NodeJS.ErrnoException)?.code
    if (code === 'EADDRINUSE') {
      hostApi.dispose()
      if (sharedHost === hostApi) sharedHost = null
      // Another TraceScope host (DSH plugin or MCP) already owns the panel port.
      // Prefer the IPv4 loopback URL so it matches the listen address (avoids ::1 mismatch).
      return {
        port,
        url: `http://127.0.0.1:${port}/`,
        close: async () => undefined,
      }
    }
    throw error
  }

  sharedPanel = {
    port,
    // Same-host panel URL for the local UI (not an outbound remote HTTP call).
    url: `http://127.0.0.1:${port}/`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => {
          hostApi.dispose()
          if (sharedHost === hostApi) sharedHost = null
          if (sharedPanel?.port === port) sharedPanel = null
          err ? reject(err) : resolve()
        })
      }),
  }
  return sharedPanel
}
