#!/usr/bin/env node
/**
 * TraceScope MCP server (stdio) — for Cursor / Claude Desktop local config / Claude Code.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createTracescopeMcpServer } from './create-server.js'

const server = createTracescopeMcpServer()
const transport = new StdioServerTransport()
await server.connect(transport)
