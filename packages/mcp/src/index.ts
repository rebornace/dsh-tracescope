#!/usr/bin/env node
/**
 * TraceScope MCP server — full agent tool surface shared with the DSH plugin.
 *
 * Tools are backed by `@rebornace/dsh-tracescope/agent-api` so Cursor / Claude /
 * any MCP client can drive the same hand-test, UI-review, and crash-analysis
 * workflows as DeepSeek Harness.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  analyzeCrashTool,
  analyzeImpactTool,
  createCrashAnalysisJob,
  createHandtestJob,
  getCrashIncident,
  getCrashJobStatus,
  getDesignSnapshot,
  getDiffTool,
  listCommits,
  listCrashFilterOptions,
  listCrashIncidents,
  parseAuthFromToolArgs,
  probeCrash,
  publishCrashAnalysis,
  publishHandtest,
  publishPageRematch,
  publishVisualFindings,
  startPageRematch,
  startVisualReview,
} from '@rebornace/dsh-tracescope/agent-api'
import { z } from 'zod'

const execFileAsync = promisify(execFile)

const authParams = {
  authMode: z.enum(['none', 'https', 'ssh']).optional(),
  authUsername: z.string().optional(),
  authToken: z.string().optional().describe('HTTPS PAT / password'),
  authPrivateKeyPath: z.string().optional().describe('SSH private key absolute path'),
}

/** Optional crash credentials; omit to use ~/.tracescope saved config for repoPath. */
const crashCredentialParams = {
  provider: z.enum(['umeng', 'crashlytics', 'local']).optional(),
  repoPath: z
    .string()
    .optional()
    .describe('Code directory / repo key for saved credentials and stack file matching'),
  appKey: z.string().optional().describe('Umeng AppKey'),
  cookie: z.string().optional().describe('Umeng Console cookie'),
  projectId: z.string().optional().describe('Firebase / GCP project id or number'),
  appId: z.string().optional().describe('Firebase App ID (1:…:ios|android:…)'),
  accessToken: z.string().optional().describe('Google OAuth access token (ya29.… )'),
  serviceAccountJson: z.string().optional().describe('Crashlytics service-account JSON'),
  stackText: z.string().optional().describe('Pasted stack for local provider / fallback'),
  title: z.string().optional(),
  lang: z.enum(['zh', 'en']).optional(),
}

function textResult(text: string) {
  return { content: [{ type: 'text' as const, text }] }
}

function jsonResult(value: unknown) {
  return textResult(JSON.stringify(value, null, 2))
}

function summaryOf(value: unknown, fallback: string) {
  if (value && typeof value === 'object' && 'summary' in value) {
    const summary = (value as { summary?: unknown }).summary
    if (typeof summary === 'string' && summary.trim()) return summary
  }
  return fallback
}

async function openPanel(): Promise<{ url: string }> {
  const { startPanelServer } = await import('@rebornace/dsh-tracescope/panel-server')
  const handle = await startPanelServer()
  return { url: handle.url }
}

const server = new McpServer({
  name: 'tracescope',
  version: '0.3.2',
})

server.tool(
  'tracescope_open_panel',
  'Open the TraceScope visual manual-test panel in the browser (best for non-technical testers).',
  {},
  async () => {
    const { url } = await openPanel()
    const platform = process.platform
    if (platform === 'win32') {
      void execFileAsync('cmd', ['/c', 'start', '', url]).catch(() => undefined)
    } else if (platform === 'darwin') {
      void execFileAsync('open', [url]).catch(() => undefined)
    } else {
      void execFileAsync('xdg-open', [url]).catch(() => undefined)
    }
    return textResult(
      `TraceScope 可视化面板已启动：${url}\n可在页面里选仓库与版本并勾选验证结果，无需敲命令。`,
    )
  },
)

server.tool(
  'tracescope_list_commits',
  'List recent git commits for a local path or remote URL. Remotes are cloned/fetched under ~/.tracescope/repos. Supports HTTPS token or SSH key auth.',
  {
    repoPath: z
      .string()
      .describe('Local git path or remote URL (https://… / git@… / github.com/org/repo)'),
    limit: z.number().int().min(1).max(100).optional().describe('Max commits (default 40)'),
    fetch: z.boolean().optional().describe('Fetch remotes first (default true)'),
    ...authParams,
  },
  async (args) => {
    const result = await listCommits({
      repoPath: args.repoPath,
      limit: args.limit,
      fetch: args.fetch,
      auth: parseAuthFromToolArgs(args as Record<string, unknown>),
    })
    return jsonResult(result)
  },
)

server.tool(
  'tracescope_get_diff',
  'Fetch a chunk of unified git diff between two commits. Use offset/limit to page through files; do not request the entire tree at once.',
  {
    repoPath: z.string().describe('Local git path or remote URL'),
    baseCommit: z.string(),
    headCommit: z.string(),
    paths: z
      .string()
      .optional()
      .describe('Optional comma-separated relative paths to limit the diff'),
    offset: z.number().int().min(0).optional().describe('File offset (default 0)'),
    limit: z.number().int().min(1).max(20).optional().describe('Max files (default 8, max 20)'),
    ...authParams,
  },
  async (args) => {
    const result = await getDiffTool(args as Record<string, unknown>)
    const v = result as {
      totalFiles?: number
      offset?: number
      nextOffset?: number
      files?: string[]
      diff?: string
    }
    return textResult(
      [
        `变更文件 ${v.totalFiles ?? 0} · 本批 offset=${v.offset ?? 0} · next=${
          v.nextOffset !== undefined && v.nextOffset >= 0 ? v.nextOffset : '无'
        }`,
        (v.files ?? []).map((f) => `- ${f}`).join('\n'),
        '',
        (v.diff ?? '').slice(0, 12_000),
      ].join('\n'),
    )
  },
)

server.tool(
  'tracescope_analyze_impact',
  'Compare two git commits (local path or remote URL) and produce a manual-test impact scope report. Supports private remotes via HTTPS token or SSH key.',
  {
    repoPath: z
      .string()
      .describe('Local git path or remote URL (https://… / git@… / github.com/org/repo)'),
    baseCommit: z.string().describe('Stable baseline commit (SHA or ref, e.g. origin/main)'),
    headCommit: z.string().describe('Under-test commit (SHA or ref)'),
    rippleDepth: z.number().int().min(1).max(5).optional(),
    modulesConfigPath: z.string().optional(),
    exportDir: z.string().optional().describe('If set, also write report.md and report.csv'),
    fetchRemote: z.boolean().optional().describe('Fetch remotes before analyze'),
    ...authParams,
  },
  async (args) => {
    const result = await analyzeImpactTool(args as Record<string, unknown>)
    const markdown =
      typeof (result as { markdown?: string }).markdown === 'string'
        ? (result as { markdown: string }).markdown.slice(0, 20_000)
        : ''
    return textResult(
      [summaryOf(result, '影响面分析完成'), '', markdown].filter(Boolean).join('\n'),
    )
  },
)

server.tool(
  'tracescope_create_handtest_job',
  'Create a TraceScope hand-test chat job and return the starter prompt. After interactive analysis, call tracescope_publish_handtest with the same jobId.',
  {
    repoPath: z.string().describe('Local git path or remote URL'),
    baseCommit: z.string(),
    headCommit: z.string(),
    fetchRemote: z.boolean().optional(),
    accessMode: z.enum(['git', 'codeup']).optional(),
    relatedWorkItems: z
      .string()
      .optional()
      .describe('Optional related work-item refs (JSON or free text)'),
    ...authParams,
  },
  async (args) => {
    const result = await createHandtestJob(args as Record<string, unknown>)
    return textResult(summaryOf(result, '已创建手测任务'))
  },
)

server.tool(
  'tracescope_publish_handtest',
  'Publish the final hand-test checklist for a TraceScope chat job so the panel can refresh and the report is persisted.',
  {
    jobId: z.string().describe('TraceScope job id from tracescope_create_handtest_job / starter prompt'),
    items: z
      .string()
      .describe(
        'JSON array of hand-test items: [{displayName,kind,risk,files,suggestedSteps,evidence}]',
      ),
  },
  async (args) => {
    const result = await publishHandtest(args as Record<string, unknown>)
    return textResult(summaryOf(result, '已发布验证清单'))
  },
)

server.tool(
  'tracescope_start_visual_review',
  'Start a design↔code UI review job and return the starter prompt. Use tracescope_get_design_snapshot as needed, then tracescope_publish_visual_findings.',
  {
    repoPath: z.string(),
    adapterId: z.string().describe('Platform adapter id, e.g. android-xml / web-react'),
    relativePath: z.string().describe('Code file relative path to compare'),
    figmaUrl: z.string().optional().describe('Figma or Lanhu design URL'),
    designUrl: z.string().optional().describe('Alias of figmaUrl'),
    designId: z.string().optional().describe('Design node / page id when known'),
    figmaToken: z.string().optional(),
    lanhuCookie: z.string().optional(),
  },
  async (args) => {
    const result = await startVisualReview(args as Record<string, unknown>)
    return textResult(summaryOf(result, '已创建 UI 走查任务'))
  },
)

server.tool(
  'tracescope_get_design_snapshot',
  'Load a compact text snapshot of the design tree for a TraceScope UI review job. Prefer a specific nodeId over the whole page.',
  {
    jobId: z.string(),
    nodeId: z.string().optional(),
    maxNodes: z.number().int().min(8).max(120).optional(),
  },
  async (args) => {
    const result = await getDesignSnapshot(args as Record<string, unknown>)
    return textResult(summaryOf(result, '设计快照'))
  },
)

server.tool(
  'tracescope_publish_visual_findings',
  'Publish structured UI review findings for a TraceScope visual job so the panel refreshes and results persist.',
  {
    jobId: z.string(),
    findings: z
      .string()
      .describe(
        'JSON array: [{title,severity,nodeId,location,expected,actual,codeSource,suggestion}]',
      ),
    renderPatch: z.string().optional().describe('Optional legacy experimental patch JSON'),
    summary: z.string().optional(),
  },
  async (args) => {
    const result = await publishVisualFindings(args as Record<string, unknown>)
    return textResult(summaryOf(result, '已写回 UI 走查结论'))
  },
)

server.tool(
  'tracescope_start_page_rematch',
  'Start a design page ↔ code file rematch job and return the starter prompt. Write back with tracescope_publish_page_rematch.',
  {
    repoPath: z.string(),
    designId: z.string(),
    figmaUrl: z.string().optional(),
    designUrl: z.string().optional(),
    adapterId: z.string().optional(),
    relativePath: z.string().optional(),
    figmaToken: z.string().optional(),
    lanhuCookie: z.string().optional(),
  },
  async (args) => {
    const result = await startPageRematch(args as Record<string, unknown>)
    return textResult(summaryOf(result, '已创建文件匹配任务'))
  },
)

server.tool(
  'tracescope_publish_page_rematch',
  'Publish AI page↔file rematch recommendations for a TraceScope rematch job.',
  {
    jobId: z.string(),
    picks: z
      .string()
      .describe('JSON array: [{adapterId,relativePath,kindLabel?,score?,reason?}]'),
    note: z.string().optional(),
  },
  async (args) => {
    const result = await publishPageRematch(args as Record<string, unknown>)
    return textResult(summaryOf(result, '已写回文件匹配推荐'))
  },
)

server.tool(
  'tracescope_crash_probe',
  'Verify Umeng / Crashlytics / local crash credentials. Pass remember=true to persist into ~/.tracescope (same store as the DSH sidebar).',
  {
    ...crashCredentialParams,
    remember: z.boolean().optional().describe('Save credentials when probe succeeds (default false)'),
  },
  async (args) => {
    const result = await probeCrash(args as Record<string, unknown>)
    return jsonResult(result)
  },
)

server.tool(
  'tracescope_crash_filter_options',
  'List crash filter options (app versions / OS / devices) for the active CrashProvider.',
  {
    ...crashCredentialParams,
    metaType: z.string().optional().describe('Provider meta type, e.g. crash / anr'),
  },
  async (args) => {
    const result = await listCrashFilterOptions(args as Record<string, unknown>)
    return jsonResult(result)
  },
)

server.tool(
  'tracescope_crash_list',
  'List crash/ANR issues from Umeng or Firebase Crashlytics (or empty for local). Uses saved credentials when tool credential fields are omitted.',
  {
    ...crashCredentialParams,
    page: z.number().int().min(1).optional(),
    pageSize: z.number().int().min(1).max(50).optional(),
    timeRange: z.string().optional().describe('e.g. 24h / 7d / 30d / 90d / custom'),
    startDay: z.string().optional(),
    endDay: z.string().optional(),
    appVersion: z.string().optional().describe('JSON array or comma-separated versions'),
    errorKind: z.string().optional().describe('crash / anr / error / other'),
    osVersions: z.string().optional().describe('JSON array of OS versions'),
    deviceModels: z.string().optional().describe('JSON array of device ids'),
    status: z.string().optional(),
    keyword: z.string().optional(),
    sort: z.string().optional(),
  },
  async (args) => {
    const result = await listCrashIncidents(args as Record<string, unknown>)
    return jsonResult(result)
  },
)

server.tool(
  'tracescope_crash_detail',
  'Fetch one crash/ANR incident (including stack text) by id from the active CrashProvider.',
  {
    ...crashCredentialParams,
    id: z.string().describe('Issue / error id from tracescope_crash_list'),
  },
  async (args) => {
    const result = await getCrashIncident(args as Record<string, unknown>)
    return jsonResult(result)
  },
)

server.tool(
  'tracescope_crash_analyze',
  'Local crash analysis: parse stack, match files under repoPath, return summary / matchedFiles / fixHints (no model call).',
  {
    repoPath: z.string().describe('Local code directory for filename matching'),
    incident: z
      .string()
      .optional()
      .describe('JSON CrashIncident from tracescope_crash_detail (preferred)'),
    stackText: z.string().optional().describe('Pasted stack when no incident JSON'),
    id: z.string().optional(),
    title: z.string().optional(),
    lang: z.enum(['zh', 'en']).optional(),
  },
  async (args) => {
    const result = await analyzeCrashTool(args as Record<string, unknown>)
    return textResult(
      [summaryOf(result, '崩溃本地分析完成'), '', JSON.stringify(result.report, null, 2)].join(
        '\n',
      ),
    )
  },
)

server.tool(
  'tracescope_create_crash_analysis_job',
  'Create a crash AI analysis job and return a starter prompt with jobId. After reasoning, call tracescope_publish_crash_analysis with the same jobId.',
  {
    repoPath: z.string(),
    summary: z.string().describe('Local analysis summary from tracescope_crash_analyze'),
    stackText: z.string().optional(),
    incident: z.string().describe('JSON CrashIncident object'),
    matchedFiles: z
      .string()
      .optional()
      .describe('JSON array from analyze report: [{path,reason,symbol?}]'),
    fixHints: z.string().optional().describe('JSON string array of fix hints'),
    lang: z.enum(['zh', 'en']).optional(),
  },
  async (args) => {
    const result = createCrashAnalysisJob(args as Record<string, unknown>)
    return textResult(summaryOf(result, '已创建崩溃分析任务'))
  },
)

server.tool(
  'tracescope_publish_crash_analysis',
  'Publish the crash/ANR AI conclusion for a TraceScope crash job so panels / clients can write it back.',
  {
    jobId: z.string().describe('Job id from tracescope_create_crash_analysis_job'),
    analysis: z.string().describe('Full AI conclusion text (root cause / impact / fix)'),
    lang: z.enum(['zh', 'en']).optional(),
  },
  async (args) => {
    const result = await publishCrashAnalysis(args as Record<string, unknown>)
    return textResult(summaryOf(result, '已写回崩溃 AI 结论'))
  },
)

server.tool(
  'tracescope_get_crash_job',
  'Poll a crash AI job for status and published aiAnalysis.',
  {
    jobId: z.string().describe('Crash job id'),
    id: z.string().optional().describe('Alias of jobId'),
    lang: z.enum(['zh', 'en']).optional(),
  },
  async (args) => {
    const result = getCrashJobStatus(args as Record<string, unknown>)
    return jsonResult(result)
  },
)

const transport = new StdioServerTransport()
await server.connect(transport)
