/**
 * TraceScope card for Desktop / Web Plugins detail pages.
 *
 * Check uses TraceScope's own npm registry probe (no dshmarket).
 * Apply prefers official pluginManager.installBundle; market is optional.
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react'
import { getT } from './locales/i18n.js'
import { useLocaleT } from './locales/use-locale-t.js'
import {
  PACKAGE_NAME,
  applySelfUpdate,
  checkSelfUpdate,
  forceRetryable,
  getSelfUpdateHostCtx,
} from './self-update.js'

type UpdateInfo = Awaited<ReturnType<typeof checkSelfUpdate>>

export type TracescopeTranslator = (key: string, params?: Record<string, string | number>) => string

function resolveT(t?: TracescopeTranslator): TracescopeTranslator {
  return t || getT()
}

/** User-facing errors (check/update/manual guide), zh or en. */
function isErrorLikeMessage(message: string): boolean {
  if (!message) return false
  return /失败|未能|请在|命令行|fail(?:ed)?|unable|could not|please .*(update|restart)|command line|\bCLI\b|update manually|market:/i.test(
    message,
  )
}

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
  t?: TracescopeTranslator
}

export function PluginSettingsCard(props: PluginSettingsCardProps): ReactElement | null {
  const liveT = useLocaleT()
  const t = props.t || liveT
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
    setMessage(t('update.checkingNpm'))
    setCanForce(false)
    try {
      const next = await checkSelfUpdate()
      setInfo(next)
      if (next.installedVersion) setVersion(next.installedVersion)
      if (next.updateAvailable) {
        let msg = t('update.foundVersion', {
          latest: next.latestVersion || '?',
          installed: next.installedVersion || '?',
        })
        if (next.registrySource) {
          msg += t('update.foundVersionSourceSuffix', { source: next.registrySource })
        }
        setMessage(msg)
      } else if (!next.latestVersion) {
        setMessage(t('update.npmReadFailed'))
      } else {
        setMessage(
          next.installedVersion
            ? t('update.alreadyLatestWithVersion', { version: next.installedVersion })
            : t('update.alreadyLatest'),
        )
      }
    } catch (e) {
      setMessage(t('update.checkFailedPrefix') + ((e as Error)?.message || String(e)))
    } finally {
      setBusy(false)
    }
  }, [t])

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
      setMessage(t('update.updating'))
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
        setMessage(t('update.updateFailedPrefix') + ((e as Error)?.message || String(e)))
      } finally {
        setBusy(false)
      }
    },
    [info, runCheck, t],
  )

  if (props.summaryOnly) {
    return (
      <span style={{ fontSize: 12, color: '#6b645a' }}>
        {t('settings.summaryDescription')}
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
            {t('settings.title')}
            {version ? <span style={ver}>v{version}</span> : null}
            {updateReady ? (
              <span style={Object.assign({}, ver, { color: '#0f6e56', fontWeight: 700 })}>
                {t('settings.newVersionBadge', { version: info?.latestVersion || '?' })}
              </span>
            ) : null}
          </div>
          <div style={desc}>{message || t('settings.defaultDescription')}</div>
        </div>
      </div>
      <div style={body}>
        <div style={row}>
          <div style={labelBox}>
            <div style={hint}>{t('settings.packageNameLabel', { name: PACKAGE_NAME })}</div>
          </div>
          <div style={actions}>
            <Btn disabled={busy} onClick={() => void runCheck()}>
              {busy ? t('update.pleaseWait') : t('update.recheck')}
            </Btn>
            {updateReady ? (
              <Btn primary disabled={busy} onClick={() => void runUpdate(false)}>
                {t('update.updateTo', {
                  version: info?.latestVersion || t('update.latestVersionLabel'),
                })}
              </Btn>
            ) : null}
            {canForce ? (
              <Btn disabled={busy} title={t('update.forceUpdateTitle')} onClick={() => void runUpdate(true)}>
                {t('update.forceUpdate')}
              </Btn>
            ) : null}
          </div>
        </div>
        {message && isErrorLikeMessage(message) ? <p style={err}>{message}</p> : null}
      </div>
    </div>
  )
}

/** Compact action next to Uninstall on the bundle detail page. */
export function PluginUpdateAction(props: {
  installedVersion?: string | null
  t?: TracescopeTranslator
}): ReactElement {
  const liveT = useLocaleT()
  const t = props.t || liveT
  const [busy, setBusy] = useState(false)
  const [info, setInfo] = useState<UpdateInfo | null>(null)
  const [label, setLabel] = useState(() => t('update.action.label'))
  const [title, setTitle] = useState(() => t('update.action.title'))
  const probed = useRef(false)

  useEffect(() => {
    // Refresh button labels when Host language switches.
    if (!info) {
      setLabel(t('update.action.label'))
      setTitle(t('update.action.title'))
      return
    }
    if (info.updateAvailable) {
      setLabel(
        info.latestVersion
          ? t('update.updateTo', { version: info.latestVersion })
          : t('update.action.label'),
      )
      setTitle(t('update.action.foundNewVersion', { version: info.latestVersion || '' }))
    } else {
      setLabel(
        info.installedVersion
          ? t('update.action.upToDateWithVersion', { version: info.installedVersion })
          : t('update.action.upToDate'),
      )
      setTitle(info.latestVersion ? t('update.action.alreadyLatestTitle') : t('update.action.npmReadFailedTitle'))
    }
  }, [t, info])

  useEffect(() => {
    if (probed.current) return
    probed.current = true
    void checkSelfUpdate()
      .then((next) => {
        setInfo(next)
        if (next.updateAvailable) {
          setLabel(
            next.latestVersion
              ? t('update.updateTo', { version: next.latestVersion })
              : t('update.action.label'),
          )
          setTitle(t('update.action.foundNewVersion', { version: next.latestVersion || '' }))
        } else {
          setLabel(
            next.installedVersion
              ? t('update.action.upToDateWithVersion', { version: next.installedVersion })
              : t('update.action.upToDate'),
          )
          setTitle(next.latestVersion ? t('update.action.alreadyLatestTitle') : t('update.action.npmReadFailedTitle'))
        }
      })
      .catch((e) => {
        setTitle((e as Error)?.message || String(e))
      })
  }, [t])

  const onClick = useCallback(async () => {
    if (busy) return
    setBusy(true)
    try {
      const current = info || (await checkSelfUpdate())
      setInfo(current)
      if (!current.updateAvailable) {
        setLabel(
          current.installedVersion
            ? t('update.action.upToDateWithVersion', { version: current.installedVersion })
            : t('update.action.upToDate'),
        )
        setTitle(
          current.latestVersion ? t('update.action.alreadyLatestTitle') : t('update.action.npmReadFailedTitle'),
        )
        return
      }
      setLabel(t('update.action.updating'))
      const result = await applySelfUpdate(current, getSelfUpdateHostCtx(), {
        onProgress: (msg) => setTitle(msg),
      })
      if (result.ok) {
        setInfo(Object.assign({}, current, { updateAvailable: false, installedVersion: result.installedVersion }))
        setLabel(
          result.installedVersion
            ? t('update.action.updatedWithVersion', { version: result.installedVersion })
            : t('update.action.updated'),
        )
        setTitle(result.message)
      } else {
        setLabel(result.channel === 'manual' ? t('update.action.manualRequired') : t('update.action.updateFailed'))
        setTitle(result.message)
      }
    } catch (e) {
      setLabel(t('update.action.failed'))
      setTitle((e as Error)?.message || String(e))
    } finally {
      setBusy(false)
    }
  }, [busy, info, t])

  const updateReady = info?.updateAvailable === true
  const installedSuffix = props.installedVersion
    ? t('update.action.currentInstalledSuffix', { version: props.installedVersion })
    : ''

  return (
    <Btn
      primary={updateReady || !info}
      disabled={busy}
      title={title + installedSuffix}
      onClick={() => void onClick()}
    >
      {busy ? t('update.action.updating') : label}
    </Btn>
  )
}
