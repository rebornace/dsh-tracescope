#!/usr/bin/env node
/**
 * TraceScope MCP over Streamable HTTP — for Claude.ai / Desktop custom connectors.
 *
 * Claude custom connectors only accept a public HTTPS URL (Anthropic's cloud dials
 * out to you). Run this locally, then expose `/mcp` with a tunnel (ngrok / cloudflared)
 * and paste `https://<tunnel>/mcp` into Customize → Connectors.
 *
 * Env:
 *   PORT                      default 3847
 *   HOST                      default 127.0.0.1 (use 0.0.0.0 only behind a tunnel)
 *   TRACESCOPE_MCP_TOKEN      optional Bearer token; set when tunneling publicly
 *   TRACESCOPE_MCP_ALLOWED_HOSTS  comma-separated Host headers (tunnel hostname)
 */
import { randomBytes } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js'
import { createTracescopeMcpServer } from './create-server.js'

if (process.argv.includes('--print-token')) {
  console.log(randomBytes(24).toString('hex'))
  process.exit(0)
}

const PORT = Number(process.env.PORT ?? 3847)
const HOST = process.env.HOST ?? '127.0.0.1'
const TOKEN = (process.env.TRACESCOPE_MCP_TOKEN ?? '').trim()
const allowedHosts = (process.env.TRACESCOPE_MCP_ALLOWED_HOSTS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const app = createMcpExpressApp({
  host: HOST,
  ...(allowedHosts.length > 0 ? { allowedHosts } : {}),
})

app.use((req: Request, res: Response, next: NextFunction) => {
  if (!TOKEN) return next()
  const header = req.header('authorization') ?? ''
  const expected = `Bearer ${TOKEN}`
  if (header === expected) return next()
  res.status(401).json({
    jsonrpc: '2.0',
    error: { code: -32001, message: 'Unauthorized' },
    id: null,
  })
})

app.post('/mcp', async (req: Request, res: Response) => {
  const server = createTracescopeMcpServer()
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  res.on('close', () => {
    void transport.close()
    void server.close()
  })
  await server.connect(transport)
  await transport.handleRequest(req, res, req.body)
})

const notAllowed = (_req: Request, res: Response) =>
  res.status(405).json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Method not allowed.' },
    id: null,
  })
app.get('/mcp', notAllowed)
app.delete('/mcp', notAllowed)

app.listen(PORT, HOST, ((err?: Error) => {
  if (err) {
    console.error(`failed to listen on ${HOST}:${PORT}: ${err.message}`)
    process.exit(1)
  }
  const tokenHint =
    TOKEN.length > 0
      ? `auth: Bearer token enabled (${TOKEN.slice(0, 4)}…)`
      : `auth: none — set TRACESCOPE_MCP_TOKEN before public tunnels`
  console.error(`tracescope-mcp HTTP listening on http://${HOST}:${PORT}/mcp`)
  console.error(tokenHint)
  if (allowedHosts.length > 0) {
    console.error(`allowedHosts: ${allowedHosts.join(', ')}`)
  } else if (HOST === '127.0.0.1' || HOST === 'localhost') {
    console.error(
      'tip: for Claude custom connectors, tunnel this port then set TRACESCOPE_MCP_ALLOWED_HOSTS=<tunnel-host>',
    )
  }
}) as (err?: Error) => void)
