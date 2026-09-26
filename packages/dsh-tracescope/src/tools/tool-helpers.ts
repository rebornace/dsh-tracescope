/**
 * Helpers shared by TraceScope tool registrations: text content blocks and
 * parsing inline auth arguments from tool call parameters.
 */
import {
  parseGitAuth,
  type GitAuth,
} from '@rebornace/tracescope-core'
import type { ToolContentBlock } from '../dsh-shims.js'

export function toolText(text: string): ToolContentBlock[] {
  return [{ type: 'text', text }]
}

export function parseAuthFromToolArgs(args: Record<string, unknown>): GitAuth | undefined {
  const authMode = typeof args.authMode === 'string' ? args.authMode : 'none'
  return parseGitAuth(
    authMode === 'https'
      ? {
          mode: 'https',
          username: typeof args.authUsername === 'string' ? args.authUsername : undefined,
          token: String(args.authToken ?? ''),
        }
      : authMode === 'ssh'
        ? {
            mode: 'ssh',
            privateKeyPath: String(args.authPrivateKeyPath ?? ''),
          }
        : { mode: 'none' },
  )
}
