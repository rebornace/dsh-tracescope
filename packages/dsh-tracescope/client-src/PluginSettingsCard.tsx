/**
 * TraceScope card for Desktop / Web Plugins detail pages.
 *
 * Check uses TraceScope's own npm registry probe (no dshmarket).
 * Apply prefers official pluginManager.installBundle; market is optional.
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react'
import {
  PACKAGE_NAME,
  applySelfUpdate,
  checkSelfUpdate,
  forceRetryable,
  getSelfUpdateHostCtx,
} from './self-update.js'

type UpdateInfo = Awaited<ReturnType<typeof checkSelfUpdate>>

const card: CSSProperties = {
  border: '1px solid var(--dsh-border, #ddd4c5)',
  borderRadius: 12,
  background: 'var(--dsh-card, #fffdf8)',
  color: 'var(--dsh-fg, #1c1915)',
  overflow: 'hidden',
}
const head: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 10,
  width: '100%',
  padding: '12px 14px',
  border: 0,
  background: 'transparent',
  cursor: 'pointer',
  textAlign: 'left',
  color: 'inherit',
}
const title: CSSProperties = { fontWeight: 700, fontSize: 14, lineHeight: 1.35 }
const desc: CSSProperties = { marginTop: 4, fontSize: 12, color: '#6b645a', lineHeight: 1.45 }
const body: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  padding: '0 14px 14px',
  borderTop: '1px solid var(--dsh-border, #eee6d8)',
}
const row: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 10,
  paddingTop: 10,
}
const labelBox: CSSProperties = { minWidth: 0, flex: 1 }
const label: CSSProperties = { fontWeight: 600, fontSize: 13 }
const hint: CSSProperties = { marginTop: 3, fontSize: 12, color: '#6b645a', lineHeight: 1.45, whiteSpace: 'pre-wrap' }
const actions: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }
const primaryBtn: CSSProperties = {
  border: 0,
  borderRadius: 999,
  padding: '6px 12px',
  cursor: 'pointer',
  background: 'var(--dsh-accent, #0f6e56)',
  color: '#fff',
  fontWeight: 700,
  fontSize: 12,
}
const secondaryBtn: CSSProperties = {
  border: '1px solid var(--dsh-border, #ddd4c5)',
  borderRadius: 999,
  padding: '6px 12px',
  cursor: 'pointer',
  background: 'var(--dsh-card, #fffdf8)',
  color: 'var(--dsh-fg, #1c1915)',
  fontSize: 12,
}
const err: CSSProperties = { color: '#b42318', fontSize: 12, lineHeight: 1.45, margin: 0, whiteSpace: 'pre-wrap' }
const ver: CSSProperties = { fontWeight: 500, color: '#6b645a', marginLeft: 6 }

function Btn(props: {
  primary?: boolean
  disabled?: boolean
  onClick: () => void
  children: string
  title?: string
}): ReactElement {
  return (
    <button
      type="button"
      title={props.title}
      disabled={props.disabled}
      onClick={props.onClick}
      style={Object.assign({}, props.primary ? primaryBtn : secondaryBtn, {
        opacity: props.disabled ? 0.6 : 1,
        cursor: props.disabled ? 'default' : 'pointer',
      })}
    >
      {props.children}
    </button>
  )
}

export type PluginSettingsCardProps = {
  installedVersion?: string | null
  summaryOnly?: boolean
}

export function PluginSettingsCard(props: PluginSettingsCardProps): ReactElement | null {
  const [busy, setBusy] = useState(false)
  const [info, setInfo] = useState<UpdateInfo | null>(null)
  const [message, setMessage] = useState('')
  const [canForce, setCanForce] = useState(false)
  const [version, setVersion] = useState<string | null>(props.installedVersion || null)
  const probed = useRef(false)

  useEffect(() => {
    if (props.installedVersion) setVersion(props.installedVersion)
  }, [props.installedVersion])

  const runCheck = useCallback(async () => {
    setBusy(true)
    setMessage('正在检查 npm 最新版本…')
    setCanForce(false)
    try {
      const next = await checkSelfUpdate()
      setInfo(next)
      if (next.installedVersion) setVersion(next.installedVersion)
      if (next.updateAvailable) {
        setMessage(
          `发现新版本 ${next.latestVersion || '?'}（当前 ${next.installedVersion || '?'}）` +
            (next.registrySource ? ` · 来源 ${next.registrySource}` : ''),
        )
      } else if (!next.latestVersion) {
        setMessage('未能从 npm 读取最新版本，请检查网络后重试。')
      } else {
        setMessage(`已是最新${next.installedVersion ? `（${next.installedVersion}）` : ''}。`)
      }
    } catch (e) {
      setMessage('检查更新失败：' + ((e as Error)?.message || String(e)))
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    if (probed.current) return
    probed.current = true
    void runCheck()
  }, [runCheck])

  const runUpdate = useCallback(
    async (force: boolean) => {
      if (!info?.updateAvailable && !force) {
        await runCheck()
        return
      }
      setBusy(true)
      setCanForce(false)
      setMessage('正在更新…')
      try {
        const result = await applySelfUpdate(info || (await checkSelfUpdate()), getSelfUpdateHostCtx(), {
          force,
          onProgress: (msg) => setMessage(msg),
        })
        if (result.installedVersion) setVersion(result.installedVersion)
        if (result.ok) {
          setInfo((prev) =>
            Object.assign({}, prev || {}, {
              installedVersion: result.installedVersion || prev?.installedVersion,
              latestVersion: result.installedVersion || prev?.latestVersion,
              updateAvailable: false,
            }),
          )
          setMessage(result.message)
        } else {
          setMessage(result.message + (result.guide && result.channel === 'manual' ? '' : result.guide ? '\n' + result.guide : ''))
          setCanForce(!!result.canForce || forceRetryable(result.failure?.code))
        }
      } catch (e) {
        setMessage('更新失败：' + ((e as Error)?.message || String(e)))
      } finally {
        setBusy(false)
      }
    },
    [info, runCheck],
  )

  if (props.summaryOnly) {
    return (
      <span style={{ fontSize: 12, color: '#6b645a' }}>
        版本对比、验证清单与设计差异
        {version ? ` · v${version}` : ''}
      </span>
    )
  }

  const updateReady = info?.updateAvailable === true

  return (
    <div style={card}>
      <div style={Object.assign({}, head, { cursor: 'default' })}>
        <div style={{ minWidth: 0 }}>
          <div style={title}>
            插件更新
            {version ? <span style={ver}>v{version}</span> : null}
            {updateReady ? (
              <span style={Object.assign({}, ver, { color: '#0f6e56', fontWeight: 700 })}>
                · 有新版本 {info?.latestVersion}
              </span>
            ) : null}
          </div>
          <div style={desc}>
            {message ||
              '对照 npm 检查本插件。优先走官方插件管理器；更新后请重启桌面端。'}
          </div>
        </div>
      </div>
      <div style={body}>
        <div style={row}>
          <div style={labelBox}>
            <div style={hint}>包名：{PACKAGE_NAME}</div>
          </div>
          <div style={actions}>
            <Btn disabled={busy} onClick={() => void runCheck()}>
              {busy ? '请稍候…' : '重新检查'}
            </Btn>
            {updateReady ? (
              <Btn primary disabled={busy} onClick={() => void runUpdate(false)}>
                {`更新到 ${info?.latestVersion || '最新版'}`}
              </Btn>
            ) : null}
            {canForce ? (
              <Btn disabled={busy} title="在可选路径上强制再装" onClick={() => void runUpdate(true)}>
                强制更新
              </Btn>
            ) : null}
          </div>
        </div>
        {message && /失败|未能|请在|命令行/.test(message) ? <p style={err}>{message}</p> : null}
      </div>
    </div>
  )
}

/** Compact action next to Uninstall on the bundle detail page. */
export function PluginUpdateAction(props: {
  installedVersion?: string | null
}): ReactElement {
  const [busy, setBusy] = useState(false)
  const [info, setInfo] = useState<UpdateInfo | null>(null)
  const [label, setLabel] = useState('更新')
  const [title, setTitle] = useState('对照 npm 更新 TraceScope')
  const probed = useRef(false)

  useEffect(() => {
    if (probed.current) return
    probed.current = true
    void checkSelfUpdate()
      .then((next) => {
        setInfo(next)
        if (next.updateAvailable) {
          setLabel(next.latestVersion ? `更新到 ${next.latestVersion}` : '更新')
          setTitle(`发现新版本 ${next.latestVersion || ''}`)
        } else {
          setLabel(next.installedVersion ? `已最新 v${next.installedVersion}` : '已最新')
          setTitle(next.latestVersion ? '当前已是最新版本' : '未能读取 npm 最新版本')
        }
      })
      .catch((e) => {
        setTitle((e as Error)?.message || String(e))
      })
  }, [])

  const onClick = useCallback(async () => {
    if (busy) return
    setBusy(true)
    try {
      const current = info || (await checkSelfUpdate())
      setInfo(current)
      if (!current.updateAvailable) {
        setLabel(current.installedVersion ? `已最新 v${current.installedVersion}` : '已最新')
        setTitle(current.latestVersion ? '当前已是最新版本' : '未能读取 npm 最新版本')
        return
      }
      setLabel('更新中…')
      const result = await applySelfUpdate(current, getSelfUpdateHostCtx(), {
        onProgress: (msg) => setTitle(msg),
      })
      if (result.ok) {
        setInfo(Object.assign({}, current, { updateAvailable: false, installedVersion: result.installedVersion }))
        setLabel(result.installedVersion ? `已更新 v${result.installedVersion}` : '已更新')
        setTitle(result.message)
      } else {
        setLabel(result.channel === 'manual' ? '请手动更新' : '更新失败')
        setTitle(result.message)
      }
    } catch (e) {
      setLabel('失败')
      setTitle((e as Error)?.message || String(e))
    } finally {
      setBusy(false)
    }
  }, [busy, info])

  const updateReady = info?.updateAvailable === true

  return (
    <Btn
      primary={updateReady || !info}
      disabled={busy}
      title={title + (props.installedVersion ? `（当前 ${props.installedVersion}）` : '')}
      onClick={() => void onClick()}
    >
      {busy ? '更新中…' : label}
    </Btn>
  )
}
