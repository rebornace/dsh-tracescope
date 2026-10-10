import { useCallback, useState, type CSSProperties } from 'react'
import { useLocaleT } from '../locales/use-locale-t.js'

export interface CrashAnalysisReport {
  incident: {
    id: string
    title: string
    provider: string
    stackText: string
    exceptionName?: string
  }
  matchedFiles: Array<{ path: string; reason: string; symbol?: string }>
  summary: string
  fixHints?: string[]
  prompt: string
  defectBody: string
}

type ApiPost = (path: string, body: unknown) => Promise<Record<string, unknown>>

export interface SendToChatResult {
  ok: boolean
  error?: string
}

const card: CSSProperties = {
  border: '1px solid var(--dsh-border, #ddd4c5)',
  borderRadius: 12,
  padding: 12,
  background: 'var(--dsh-card, #fffdf8)',
}

const label: CSSProperties = { display: 'grid', gap: 4, marginBottom: 8, fontWeight: 600 }

const input: CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid var(--dsh-border, #ddd4c5)',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
  fontSize: 13,
}

const row: CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }

const btn: CSSProperties = {
  border: 0,
  borderRadius: 999,
  padding: '8px 12px',
  cursor: 'pointer',
  background: 'var(--dsh-accent-soft, #efe8da)',
}

const primary: CSSProperties = {
  ...btn,
  background: 'var(--dsh-accent, #0f6e56)',
  color: '#fff',
  fontWeight: 700,
}

function localIncidentId(): string {
  return 'local-' + Date.now().toString(36)
}

function defaultTitle(stack: string, custom: string): string {
  const t = custom.trim()
  if (t) return t.slice(0, 200)
  const first = stack
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find(Boolean)
  return (first || 'Crash').slice(0, 200)
}

export function CrashBoard({
  repoPath,
  trackerReady,
  onSendToChat,
  onSubmitDefect,
  apiPost,
  onOpenTrackerSettings,
}: {
  repoPath: string
  lang?: string
  trackerReady?: boolean
  onSendToChat?: (prompt: string) => SendToChatResult
  onSubmitDefect?: (report: CrashAnalysisReport, subject: string) => void
  apiPost: ApiPost
  onOpenTrackerSettings?: () => void
}) {
  const t = useLocaleT()
  const [stackText, setStackText] = useState('')
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [hint, setHint] = useState('')
  const [report, setReport] = useState<CrashAnalysisReport | null>(null)
  const [umengOpen, setUmengOpen] = useState(false)

  const runAnalyze = useCallback(async (): Promise<CrashAnalysisReport | null> => {
    const stack = stackText.trim()
    if (!stack) {
      setError(t('crash.pasteLabel'))
      return null
    }
    const repo = repoPath.trim()
    if (!repo) {
      setError(t('选择仓库 / 先在配置中添加'))
      return null
    }
    setBusy(true)
    setError('')
    setHint('')
    try {
      const incident = {
        id: localIncidentId(),
        title: defaultTitle(stack, title),
        provider: 'local' as const,
        stackText: stack,
      }
      const data = await apiPost('/tracescope/v1/crash-analyze', { repoPath: repo, incident })
      const next = data.report as CrashAnalysisReport | undefined
      if (!next || typeof next.prompt !== 'string') {
        throw new Error(t('请求失败'))
      }
      setReport(next)
      return next
    } catch (err) {
      setError((err as Error).message || String(err))
      return null
    } finally {
      setBusy(false)
    }
  }, [apiPost, repoPath, stackText, t, title])

  async function onAnalyzeClick() {
    await runAnalyze()
  }

  async function onWriteSessionClick() {
    let r = report
    if (!r) r = await runAnalyze()
    if (!r) return
    const send = onSendToChat
    if (!send) {
      setHint(t('找不到会话输入框服务'))
      return
    }
    const result = send(r.prompt)
    if (result.ok) {
      setHint(t('diff.board.chatFilling'))
    } else {
      setError(result.error || t('无法写入当前会话输入框'))
    }
  }

  function onSubmitClick() {
    if (!report) {
      setError(t('crash.analyze'))
      return
    }
    if (!trackerReady) {
      setHint(t('diff.board.hint.finishTrackerConfig'))
      onOpenTrackerSettings?.()
      return
    }
    if (!onSubmitDefect) return
    const subject =
      report.incident.title ||
      defaultTitle(stackText, title) ||
      t('crash.submitDefect')
    onSubmitDefect(report, subject)
  }

  const noMatch = report && (!report.matchedFiles || !report.matchedFiles.length)

  return (
    <section style={card}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>{t('crash.mode')}</div>
      <label style={label}>
        {t('crash.pasteLabel')}
        <textarea
          style={{ ...input, minHeight: 140, resize: 'vertical', fontFamily: 'ui-monospace, monospace' }}
          value={stackText}
          disabled={busy}
          placeholder={t('crash.pasteLabel')}
          onChange={(e) => setStackText(e.target.value)}
        />
      </label>
      <label style={label}>
        {t('缺陷标题')}
        <input
          style={input}
          value={title}
          disabled={busy}
          placeholder={t('（未填写）')}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <div style={{ ...row, marginBottom: 10 }}>
        <button type="button" style={primary} disabled={busy} onClick={() => void onAnalyzeClick()}>
          {busy ? t('common.loading') : t('crash.analyze')}
        </button>
        <button type="button" style={btn} disabled={busy} onClick={() => void onWriteSessionClick()}>
          {t('crash.writeSession')}
        </button>
        <button type="button" style={btn} disabled={busy || !report} onClick={onSubmitClick}>
          {t('crash.submitDefect')}
        </button>
      </div>
      {error ? (
        <p style={{ margin: '0 0 8px', color: '#b42318', fontSize: 12, lineHeight: 1.45 }}>{error}</p>
      ) : null}
      {hint ? (
        <p style={{ margin: '0 0 8px', color: '#6b645a', fontSize: 12, lineHeight: 1.45 }}>{hint}</p>
      ) : null}
      {report ? (
        <div style={{ marginTop: 4 }}>
          <div
            style={{
              padding: '10px 12px',
              background: '#f7f4ee',
              borderRadius: 8,
              border: '1px solid var(--dsh-border, #ddd4c5)',
              marginBottom: 8,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 6 }}>{t('AI 分析')}</div>
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{report.summary}</p>
            {noMatch ? (
              <p style={{ margin: '8px 0 0', fontSize: 12, color: '#b54708' }}>{t('crash.noRepoMatch')}</p>
            ) : null}
          </div>
          {report.matchedFiles?.length ? (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 12 }}>{t('- 相关文件：')}</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.45 }}>
                {report.matchedFiles.map((m) => (
                  <li key={m.path + (m.symbol || '')}>
                    <code>{m.path}</code>
                    {m.symbol ? ` · ${m.symbol}` : ''}
                    {m.reason ? ` — ${m.reason}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <details>
            <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>
              {t('crash.promptPreview')}
            </summary>
            <pre
              style={{
                margin: '8px 0 0',
                padding: 10,
                background: '#fff',
                border: '1px solid var(--dsh-border, #ddd4c5)',
                borderRadius: 8,
                fontSize: 11,
                lineHeight: 1.4,
                maxHeight: 200,
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
              }}
            >
              {report.prompt}
            </pre>
          </details>
        </div>
      ) : null}
      <div style={{ marginTop: 12, borderTop: '1px solid var(--dsh-border, #ddd4c5)', paddingTop: 10 }}>
        <button
          type="button"
          style={{ ...btn, width: '100%', textAlign: 'left', fontWeight: 600 }}
          onClick={() => setUmengOpen((v) => !v)}
        >
          {umengOpen ? '▾ ' : '▸ '}
          {t('crash.umengConfig')}
        </button>
        {umengOpen ? (
          <p style={{ margin: '8px 0 0', color: '#6b645a', fontSize: 12, lineHeight: 1.45 }}>
            {t('crash.cookieHint')}
          </p>
        ) : null}
      </div>
    </section>
  )
}
