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
    try {
      const raw = await readBody(req)
      const body = JSON.parse(raw || '{}') as {
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
      const repoPath = body.repoPath ?? ''
      const limit = Number(body.limit ?? 40)
      const refName = typeof body.refName === 'string' ? body.refName.trim() : ''
      if (!repoPath) {
        sendJson(res, 400, { error: '缺少 repoPath（本地路径或远端地址）' })
        return true
      }
      const fetchRemote = parseFetchFlag(body.fetch, true)
      if (body.accessMode === 'codeup') {
        const codeup = await resolveCodeupAuth({
          accessMode: 'codeup',
          codeup: body.codeup ?? {},
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
      const auth = await resolveRequestGitAuth(parseGitAuth(body.auth), repoPath)
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
      sendJson(res, 400, { error: `无法读取 git 历史：${message}` })
    }
    return true
  }

  if (url.pathname === '/api/commits' && req.method === 'GET') {
    const repoPath = url.searchParams.get('repoPath') ?? ''
    const limit = Number(url.searchParams.get('limit') ?? '40')
    if (!repoPath) {
      sendJson(res, 400, { error: '缺少 repoPath（本地路径或远端地址）' })
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
      sendJson(res, 400, { error: `无法读取 git 历史：${message}` })
    }
    return true
  }

  if (url.pathname === '/api/analyze' && req.method === 'POST') {
    try {
      const raw = await readBody(req)
      const body = JSON.parse(raw) as Record<string, unknown>
      const repoPath = String(body.repoPath ?? '')
      const baseCommit = String(body.baseCommit ?? '')
      const headCommit = String(body.headCommit ?? '')
      if (!repoPath || !baseCommit || !headCommit) {
        sendJson(res, 400, { error: '需要 repoPath、baseCommit、headCommit' })
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
      const message = error instanceof Error ? error.message : String(error)
      sendJson(res, 400, { error: message })
    }
    return true
  }

  if (url.pathname === '/api/export' && req.method === 'POST') {
    try {
      const raw = await readBody(req)
      const body = JSON.parse(raw) as {
        exportDir?: string
        report?: ImpactReport
      }
      if (!body.exportDir || !body.report) {
        sendJson(res, 400, { error: '需要 exportDir 与 report' })
        return true
      }
      const markdown = exportReportMarkdown(body.report)
      const csv = exportReportCsv(body.report)
      await writeReportExports(body.exportDir, markdown, csv)
      sendJson(res, 200, {
        ok: true,
        files: [
          path.join(body.exportDir, 'tracescope-report.md'),
          path.join(body.exportDir, 'tracescope-report.csv'),
        ],
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      sendJson(res, 400, { error: message })
    }
    return true
  }

  if (url.pathname === '/api/visual-compare' && req.method === 'POST') {
    try {
      const raw = await readBody(req)
      const body = JSON.parse(raw || '{}') as {
        figmaUrl?: string
        figmaToken?: string
        codePath?: string
      }
      const figmaUrl = (body.figmaUrl ?? '').trim()
      const figmaToken = (body.figmaToken ?? '').trim()
      const codePath = (body.codePath ?? '').trim()
      if (!figmaUrl || !figmaToken) {
        sendJson(res, 400, { error: '需要 Figma 链接和访问 Token' })
        return true
      }
      if (!codePath) {
        sendJson(res, 400, { error: '需要代码布局文件路径' })
        return true
      }
      if (!existsSync(codePath)) {
        sendJson(res, 400, { error: `找不到代码文件：${codePath}` })
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
      const message = error instanceof Error ? error.message : String(error)
      sendJson(res, 400, { error: message })
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

export async function startPanelServer(port = DEFAULT_PORT): Promise<PanelServerHandle> {
  if (sharedPanel) return sharedPanel

  const staticRoot = panelStaticRoot()

  const server: Server = createServer(async (req, res) => {
    try {
      const host = req.headers.host ?? `127.0.0.1:${port}`
      const url = new URL(req.url ?? '/', `http://${host}`)

      if (await handleApi(req, res, url)) return

      let rel = url.pathname === '/' ? '/index.html' : url.pathname
      rel = path.normalize(rel).replace(/^(\.\.[/\\])+/, '')
      const filePath = path.join(staticRoot, rel)
      if (!filePath.startsWith(staticRoot)) {
        res.writeHead(403).end('Forbidden')
        return
      }
      const data = await readFile(filePath)
      res.writeHead(200, { 'Content-Type': contentType(filePath) })
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
      server.listen(port, '127.0.0.1', () => resolve())
    })
  } catch (error: unknown) {
    const code = (error as NodeJS.ErrnoException)?.code
    if (code === 'EADDRINUSE') {
      // Another TraceScope host (DSH plugin or MCP) already owns the panel port.
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
    url: `http://127.0.0.1:${port}/`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (sharedPanel?.port === port) sharedPanel = null
          err ? reject(err) : resolve()
        })
      }),
  }
  return sharedPanel
}
