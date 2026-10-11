/**
 * Proxy-aware fetch for Google APIs (Crashlytics / OAuth).
 * Node's built-in fetch ignores Windows system proxy; Clash/V2Ray users need this.
 */
import { execFileSync } from 'node:child_process'
import { fetch as undiciFetch, ProxyAgent, type RequestInit as UndiciRequestInit } from 'undici'

export type ProxyAwareFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>

let cachedProxyUrl: string | null | undefined
let cachedAgent: ProxyAgent | undefined

/** Reset caches (tests). */
export function clearProxyFetchCacheForTests(): void {
  cachedProxyUrl = undefined
  cachedAgent = undefined
}

export function resolveOutboundProxyUrl(): string | undefined {
  if (cachedProxyUrl !== undefined) {
    return cachedProxyUrl ?? undefined
  }
  const fromEnv =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    process.env.ALL_PROXY ||
    process.env.all_proxy
  if (fromEnv?.trim()) {
    cachedProxyUrl = normalizeProxyUrl(fromEnv.trim())
    return cachedProxyUrl
  }
  const fromWin = readWindowsInternetProxy()
  cachedProxyUrl = fromWin ? normalizeProxyUrl(fromWin) : null
  return cachedProxyUrl ?? undefined
}

function normalizeProxyUrl(raw: string): string {
  const s = raw.trim()
  if (!s) return s
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) return s
  return `http://${s}`
}

/** Read HKCU Internet Settings ProxyServer when ProxyEnable=1. */
export function readWindowsInternetProxy(): string | undefined {
  if (process.platform !== 'win32') return undefined
  try {
    const enableOut = execFileSync(
      'reg',
      [
        'query',
        'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings',
        '/v',
        'ProxyEnable',
      ],
      { encoding: 'utf8', timeout: 3000, windowsHide: true },
    )
    if (!/ProxyEnable\s+REG_DWORD\s+0x1\b/i.test(enableOut)) return undefined
    const serverOut = execFileSync(
      'reg',
      [
        'query',
        'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings',
        '/v',
        'ProxyServer',
      ],
      { encoding: 'utf8', timeout: 3000, windowsHide: true },
    )
    const m = serverOut.match(/ProxyServer\s+REG_SZ\s+(\S+)/i)
    const server = m?.[1]?.trim()
    if (!server) return undefined
    if (server.includes('=')) {
      const parts = server.split(';').map((p) => p.trim())
      const https = parts.find((p) => p.toLowerCase().startsWith('https='))?.slice(6)
      const http = parts.find((p) => p.toLowerCase().startsWith('http='))?.slice(5)
      return https || http || undefined
    }
    return server
  } catch {
    return undefined
  }
}

function getProxyAgent(): ProxyAgent | undefined {
  const proxyUrl = resolveOutboundProxyUrl()
  if (!proxyUrl) return undefined
  if (!cachedAgent) {
    cachedAgent = new ProxyAgent(proxyUrl)
  }
  return cachedAgent
}

/**
 * fetch that honors HTTPS_PROXY / Windows system proxy.
 * Falls back to global fetch when no proxy is configured.
 */
export const proxyAwareFetch: ProxyAwareFetch = async (input, init) => {
  const agent = getProxyAgent()
  if (!agent) {
    return globalThis.fetch(input, init)
  }
  const url = typeof input === 'string' ? input : input.toString()
  const undiciInit: UndiciRequestInit = {
    method: init?.method,
    headers: init?.headers as UndiciRequestInit['headers'],
    body: init?.body as UndiciRequestInit['body'],
    redirect: init?.redirect,
    signal: init?.signal as UndiciRequestInit['signal'],
    dispatcher: agent,
  }
  const res = await undiciFetch(url, undiciInit)
  // undici Response is compatible enough for .ok/.status/.text()/.json()
  return res as unknown as Response
}

export function formatProxyHint(): string {
  const proxy = resolveOutboundProxyUrl()
  if (proxy) return `已使用代理 ${proxy}`
  return '未检测到 HTTPS_PROXY / 系统代理；国内访问 Google 通常需要代理'
}
