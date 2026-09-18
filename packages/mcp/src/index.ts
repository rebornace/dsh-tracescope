#!/usr/bin/env node
import { execFile } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  analyzeImpact,
  exportReportCsv,
  exportReportMarkdown,
  listGitRefs,
  listRecentCommits,
  parseGitAuth,
  resolveGitRepo,
} from '@rebornace/tracescope-core'
import { z } from 'zod'

const execFileAsync = promisify(execFile)

async function openPanel(): Promise<{ url: string }> {
  const { startPanelServer } = await import('@rebornace/dsh-tracescope/panel-server')
  const handle = await startPanelServer()
  return { url: handle.url }
}

const server = new McpServer({
  name: 'tracescope',
  version: '0.1.0',
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
    return {
      content: [
        {
          type: 'text',
          text: `TraceScope 可视化面板已启动：${url}\n测试同学可在页面里选仓库与版本并勾选手测结果，无需敲命令。`,
        },
      ],
    }
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
    authMode: z.enum(['none', 'https', 'ssh']).optional(),
    authUsername: z.string().optional(),
    authToken: z.string().optional().describe('HTTPS PAT / password'),
    authPrivateKeyPath: z.string().optional().describe('SSH private key absolute path'),
  },
  async ({ repoPath, limit, fetch, authMode, authUsername, authToken, authPrivateKeyPath }) => {
    const auth = parseGitAuth(
      authMode === 'https'
        ? { mode: 'https', username: authUsername, token: authToken ?? '' }
        : authMode === 'ssh'
          ? { mode: 'ssh', privateKeyPath: authPrivateKeyPath ?? '' }
          : { mode: 'none' },
    )
    const resolved = await resolveGitRepo(repoPath, { fetch: fetch ?? true, auth })
    const commits = await listRecentCommits(resolved.repoPath, {
      limit: limit ?? 40,
      allRefs: true,
    })
    const refs = await listGitRefs(resolved.repoPath)
    return {
      content: [{ type: 'text', text: JSON.stringify({ resolved, commits, refs }, null, 2) }],
    }
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
    authMode: z.enum(['none', 'https', 'ssh']).optional(),
    authUsername: z.string().optional(),
    authToken: z.string().optional(),
    authPrivateKeyPath: z.string().optional(),
  },
  async (args) => {
    const auth = parseGitAuth(
      args.authMode === 'https'
        ? { mode: 'https', username: args.authUsername, token: args.authToken ?? '' }
        : args.authMode === 'ssh'
          ? { mode: 'ssh', privateKeyPath: args.authPrivateKeyPath ?? '' }
          : { mode: 'none' },
    )
    const report = await analyzeImpact({
      repoPath: args.repoPath,
      baseCommit: args.baseCommit,
      headCommit: args.headCommit,
      rippleDepth: args.rippleDepth,
      modulesConfigPath: args.modulesConfigPath,
      fetchRemote: args.fetchRemote,
      auth,
    })
    const markdown = exportReportMarkdown(report)
    const csv = exportReportCsv(report)
    if (args.exportDir) {
      await mkdir(args.exportDir, { recursive: true })
      await writeFile(path.join(args.exportDir, 'tracescope-report.md'), markdown, 'utf8')
      await writeFile(path.join(args.exportDir, 'tracescope-report.csv'), csv, 'utf8')
    }
    const summary = [
      `直接变更 ${report.direct.length} · 可能波及 ${report.ripple.length} · 变更文件 ${report.changedFiles.length}`,
      '',
      '## 直接变更',
      ...report.direct.map((i) => `- [${i.risk}] ${i.displayName}`),
      '',
      '## 可能波及',
      ...report.ripple.map((i) => `- [${i.risk}] ${i.displayName}`),
      '',
      markdown.slice(0, 20_000),
    ].join('\n')
    return { content: [{ type: 'text', text: summary }] }
  },
)

const transport = new StdioServerTransport()
await server.connect(transport)
