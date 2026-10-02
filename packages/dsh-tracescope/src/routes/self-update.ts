/**
 * Self-update discovery — registry check only.
 *
 * Does NOT depend on dshmarket. Applying an update is left to the official
 * Host `pluginManager.installBundle` remote (Desktop / Web Plugins page) or
 * the user's Desktop Extension Dock / `dsh plugin` CLI.
 */
import type { Context } from '../dsh-shims.js'
import { registerRoute } from '../http/route-helpers.js'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE_NAME = '@rebornace/dsh-tracescope'

const pkgJson = JSON.parse(
  // Bundled entry lives in dist/; package.json is one level up.
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../package.json'), 'utf8'),
) as { name?: string; version?: string }

function encodeScopedName(name: string): string {
  // registry.npmjs.org wants /@scope%2Fpkg/latest
  if (name.startsWith('@')) {
    const slash = name.indexOf('/')
    if (slash > 0) {
      return `${name.slice(0, slash)}%2F${name.slice(slash + 1)}`
    }
  }
  return name
}

function registryUrls(name: string): string[] {
  const encoded = encodeScopedName(name)
  return [
    `https://registry.npmmirror.com/${encoded}/latest`,
    `https://registry.npmjs.org/${encoded}/latest`,
  ]
}

/** Compare dotted semver cores; prerelease tags sort below the plain release. */
export function isNewerVersion(latest: string, installed: string): boolean {
  const parse = (v: string) => {
    const core = String(v).trim().replace(/^v/i, '')
    const dash = core.indexOf('-')
    const main = dash >= 0 ? core.slice(0, dash) : core
    const pre = dash >= 0 ? core.slice(dash + 1) : ''
    const nums = main.split('.').map((p) => {
      const n = Number.parseInt(p, 10)
      return Number.isFinite(n) ? n : 0
    })
    while (nums.length < 3) nums.push(0)
    return { nums: nums.slice(0, 3) as [number, number, number], pre }
  }
  const a = parse(latest)
  const b = parse(installed)
  for (let i = 0; i < 3; i++) {
    const av = a.nums[i] ?? 0
    const bv = b.nums[i] ?? 0
    if (av !== bv) return av > bv
  }
  if (!a.pre && b.pre) return true
  if (a.pre && !b.pre) return false
  return a.pre > b.pre
}

async function fetchLatestVersion(name: string): Promise<{ version: string | null; source: string | null }> {
  for (const url of registryUrls(name)) {
    try {
      const res = await fetch(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      })
      if (!res.ok) continue
      const body = (await res.json()) as { version?: unknown }
      if (typeof body.version === 'string' && body.version.trim()) {
        return { version: body.version.trim(), source: url.includes('npmmirror') ? 'npmmirror' : 'npmjs' }
      }
    } catch {
      /* try next */
    }
  }
  return { version: null, source: null }
}

export function registerSelfUpdateRoutes(ctx: Context) {
  registerRoute(ctx, {
    path: '/tracescope/v1/self-update/check',
    method: 'GET',
    run: async () => {
      const name = pkgJson.name || PACKAGE_NAME
      const installedVersion = pkgJson.version || null
      const { version: latestVersion, source } = await fetchLatestVersion(name)
      const updateAvailable =
        !!latestVersion && !!installedVersion && isNewerVersion(latestVersion, installedVersion)
      return {
        ok: true,
        packageName: name,
        installedVersion,
        latestVersion,
        updateAvailable,
        registrySource: source,
        applyHint: {
          pluginManagerSpec: latestVersion ? `${name}@${latestVersion}` : name,
          cli: latestVersion
            ? `dsh plugin add "${name}@${latestVersion}"`
            : `dsh plugin update ${name}`,
          desktop: '桌面端：扩展坞（Extension Dock）或「插件」页中更新本包，然后重启 Harness。',
        },
      }
    },
  })
}
