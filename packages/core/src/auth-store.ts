import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { parseGitAuth, type GitAuth } from './auth.js'

function authStorePath(cacheRoot?: string): string {
  const root = cacheRoot ?? path.join(os.homedir(), '.tracescope')
  return path.join(root, 'auth.json')
}

export type StoredGitAuth = Exclude<GitAuth, { mode: 'none' }>

/** Load remembered git auth from ~/.tracescope/auth.json (if any). */
export async function loadStoredGitAuth(cacheRoot?: string): Promise<StoredGitAuth | null> {
  try {
    const raw = await readFile(authStorePath(cacheRoot), 'utf8')
    const parsed = parseGitAuth(JSON.parse(raw))
    if (!parsed || parsed.mode === 'none') return null
    return parsed
  } catch {
    return null
  }
}

/** Persist git auth for Desktop restarts. Pass null / none to clear. */
export async function saveStoredGitAuth(
  auth: GitAuth | null | undefined,
  cacheRoot?: string,
): Promise<void> {
  const file = authStorePath(cacheRoot)
  if (!auth || auth.mode === 'none') {
    try {
      await unlink(file)
    } catch {
      /* absent is fine */
    }
    return
  }
  await mkdir(path.dirname(file), { recursive: true })
  const payload =
    auth.mode === 'https'
      ? {
          mode: 'https',
          username: auth.username || 'git',
          token: auth.token,
        }
      : {
          mode: 'ssh',
          privateKeyPath: auth.privateKeyPath,
        }
  await writeFile(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}
