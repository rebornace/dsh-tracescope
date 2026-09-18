/**
 * Non-interactive git authentication for remote clone/fetch.
 * Secrets stay in process env for the git subprocess only — never logged.
 */

export type GitAuth =
  | { mode: 'none' }
  | {
      mode: 'https'
      /** Defaults to `git` (works with GitHub/GitLab PATs). */
      username?: string
      /** Personal access token or password. */
      token: string
    }
  | {
      mode: 'ssh'
      /** Absolute path to a private key file. */
      privateKeyPath: string
    }

export interface GitAuthEnv {
  env: NodeJS.ProcessEnv
  /** Extra git -c config args prepended before the subcommand. */
  configArgs: string[]
}

function quoteSshPath(filePath: string): string {
  // ssh -i accepts forward slashes on Windows; quote for spaces.
  const normalized = filePath.replace(/\\/g, '/')
  if (/[\s"]/u.test(normalized)) {
    return `"${normalized.replace(/"/g, '\\"')}"`
  }
  return normalized
}

/** Build env / -c overrides so git never waits on an interactive prompt. */
export function buildGitAuthEnv(auth: GitAuth | undefined): GitAuthEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0',
  }
  const configArgs: string[] = []

  if (!auth || auth.mode === 'none') {
    return { env, configArgs }
  }

  if (auth.mode === 'https') {
    const token = auth.token.trim()
    if (!token) throw new Error('HTTPS 认证需要填写 Token / 密码')
    const username = (auth.username?.trim() || 'git').replace(/:/g, '')
    const basic = Buffer.from(`${username}:${token}`, 'utf8').toString('base64')
    // Prefer -c so it does not collide with an existing GIT_CONFIG_COUNT.
    configArgs.push('-c', `http.extraHeader=Authorization: Basic ${basic}`)
    return { env, configArgs }
  }

  if (auth.mode === 'ssh') {
    const keyPath = auth.privateKeyPath.trim()
    if (!keyPath) throw new Error('SSH 认证需要填写私钥文件路径')
    env.GIT_SSH_COMMAND = [
      'ssh',
      '-o',
      'BatchMode=yes',
      '-o',
      'StrictHostKeyChecking=accept-new',
      '-i',
      quoteSshPath(keyPath),
    ].join(' ')
    return { env, configArgs }
  }

  const _exhaustive: never = auth
  return _exhaustive
}

/**
 * When HTTPS auth is selected but the user pasted an SSH remote, rewrite to HTTPS
 * so the token can be applied.
 */
export function adaptRemoteUrlForAuth(remoteUrl: string, auth: GitAuth | undefined): string {
  if (!auth || auth.mode !== 'https') return remoteUrl
  const ssh = remoteUrl.match(/^git@([^:]+):(.+)$/i)
  if (ssh) {
    const host = ssh[1]!
    const repoPath = ssh[2]!.replace(/\.git$/i, '')
    return `https://${host}/${repoPath}.git`
  }
  const sshUrl = remoteUrl.match(/^ssh:\/\/([^/]+)\/(.+)$/i)
  if (sshUrl) {
    const host = sshUrl[1]!.replace(/^git@/i, '')
    const repoPath = sshUrl[2]!.replace(/\.git$/i, '')
    return `https://${host}/${repoPath}.git`
  }
  return remoteUrl
}

/** Parse a loose JSON auth payload from HTTP / MCP args. */
export function parseGitAuth(raw: unknown): GitAuth | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('auth 必须是对象：{ mode: none|https|ssh, ... }')
  }
  const obj = raw as Record<string, unknown>
  const mode = String(obj.mode ?? obj.type ?? 'none').toLowerCase()
  if (mode === 'none' || mode === 'public') return { mode: 'none' }
  if (mode === 'https' || mode === 'token' || mode === 'pat') {
    return {
      mode: 'https',
      username: typeof obj.username === 'string' ? obj.username : undefined,
      token: String(obj.token ?? obj.password ?? ''),
    }
  }
  if (mode === 'ssh') {
    return {
      mode: 'ssh',
      privateKeyPath: String(obj.privateKeyPath ?? obj.keyPath ?? obj.identityFile ?? ''),
    }
  }
  throw new Error(`不支持的 auth.mode：${mode}（可选 none / https / ssh）`)
}

/** Redact secrets for any diagnostic string. */
export function redactSecrets(text: string): string {
  return text
    .replace(/Authorization:\s*Basic\s+\S+/gi, 'Authorization: Basic ***')
    .replace(/\/\/[^/@\s]+:[^/@\s]+@/g, '//***:***@')
}
