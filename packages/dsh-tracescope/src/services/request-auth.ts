/**
 * Request-level authentication helpers shared by routes that need repository
 * access. Resolves inline body credentials against the credentials remembered
 * on this machine and supports the Codeup (Yunxiao) HTTPS flow.
 */
import {
  isMaskedSecret,
  loadRememberedYunxiaoAccess,
  loadStoredGitAuth,
  parseGitAuth,
  type GitAuth,
} from '@rebornace/tracescope-core'

export type AccessMode = 'git' | 'codeup'

export function readAccessMode(body: Record<string, unknown>): AccessMode {
  return body.accessMode === 'codeup' ? 'codeup' : 'git'
}

export interface CodeupBodyAuth {
  endpoint?: string
  token: string
  organizationId?: string
  repositoryId?: string
}

function readCodeupAuth(body: Record<string, unknown>): CodeupBodyAuth {
  const raw = body.codeup
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    endpoint: typeof obj.endpoint === 'string' ? obj.endpoint : undefined,
    token: String(obj.token ?? ''),
    organizationId: typeof obj.organizationId === 'string' ? obj.organizationId : undefined,
    repositoryId: typeof obj.repositoryId === 'string' ? obj.repositoryId : undefined,
  }
}

export function isCodeupHttpsRemote(input: string): boolean {
  return /^https:\/\/codeup\.aliyun\.com\//i.test(input.trim())
}

/** Empty or masked panel tokens fall back to the token saved on this machine. */
export async function resolveCodeupAuth(body: Record<string, unknown>): Promise<CodeupBodyAuth> {
  const parsed = readCodeupAuth(body)
  if (!isMaskedSecret(parsed.token)) return parsed
  const stored = await loadRememberedYunxiaoAccess()
  const git = await loadStoredGitAuth()
  const gitToken = git?.mode === 'https' ? git.token : ''
  return {
    ...parsed,
    endpoint: parsed.endpoint || stored.endpoint,
    organizationId: parsed.organizationId || stored.organizationId || undefined,
    token: !isMaskedSecret(stored.token) ? stored.token : gitToken,
  }
}

export async function resolveRequestGitAuth(
  auth: GitAuth | undefined,
  repoInput: string,
): Promise<GitAuth | undefined> {
  if (auth?.mode === 'ssh') return auth
  if (auth?.mode === 'https' && !isMaskedSecret(auth.token)) return auth
  const stored = await loadStoredGitAuth()
  if (auth?.mode === 'https' && stored?.mode === 'https' && !isMaskedSecret(stored.token)) {
    return {
      mode: 'https',
      username: auth.username || stored.username || 'git',
      token: stored.token,
    }
  }
  if (isCodeupHttpsRemote(repoInput)) {
    const yunxiao = await loadRememberedYunxiaoAccess()
    if (!isMaskedSecret(yunxiao.token)) {
      return {
        mode: 'https',
        username: auth?.mode === 'https' ? auth.username || 'git' : 'git',
        token: yunxiao.token,
      }
    }
  }
  if (auth?.mode === 'https' && stored?.mode === 'ssh') return stored
  return auth
}

export { parseGitAuth }
