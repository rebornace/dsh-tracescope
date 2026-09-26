import { useState } from 'react'

interface MatchCandidate {
  adapterId: string
  platform: string
  kindLabel: string
  relativePath: string
  precise: boolean
  score: number
  reasons: string[]
}

interface CompareData {
  page: { adapterId: string; kindLabel: string; relativePath: string; precise: boolean }
  precise: boolean
  reason?: string
  result?: {
    diffs: Array<Record<string, unknown>>
    unmatched: Array<Record<string, unknown>>
    comparedPairs: number
  }
}

async function post(path: string, body: unknown) {
  const r = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await r.text()
  const data = text ? JSON.parse(text) : {}
  if (!r.ok) throw new Error(data.error || '请求失败')
  return data
}

const PROPERTY_LABELS: Record<string, string> = {
  width: '宽度',
  height: '高度',
  marginTop: '上外边距',
  marginRight: '右外边距',
  marginBottom: '下外边距',
  marginLeft: '左外边距',
  paddingTop: '上内边距',
  paddingRight: '右内边距',
  paddingBottom: '下内边距',
  paddingLeft: '左内边距',
  backgroundColor: '背景色',
  borderWidth: '边框宽',
  borderColor: '边框色',
  cornerRadius: '圆角',
  opacity: '不透明度',
  fontFamily: '字体',
  fontSize: '字号',
  fontWeight: '字重',
  lineHeight: '行高',
  letterSpacing: '字间距',
  color: '文字颜色',
}

function VisualValue({ value }: { value: unknown }) {
  if (value && typeof value === 'object' && 'unresolved' in value) {
    return <span style={{ color: '#9a6700' }}>待确认：{String((value as { raw: string }).raw)}</span>
  }
  return <span>{String(value)}</span>
}

export interface VisualComparePanelProps {
  repoInput: string
  auth?: unknown
}

export function VisualComparePanel({ repoInput, auth }: VisualComparePanelProps) {
  const [figmaUrl, setFigmaUrl] = useState('')
  const [figmaToken, setFigmaToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'matched'>('idle')
  const [candidates, setCandidates] = useState<MatchCandidate[]>([])
  const [selectedKey, setSelectedKey] = useState('')
  const [data, setData] = useState<CompareData | null>(null)
  const [error, setError] = useState('')

  const basePayload = () => ({
    repoPath: repoInput,
    auth,
    figmaUrl: figmaUrl.trim(),
    figmaToken: figmaToken.trim(),
  })

  async function locate() {
    setError('')
    setData(null)
    if (!figmaUrl.trim() || !figmaToken.trim()) {
      setError('请填写设计稿链接和访问 Token')
      return
    }
    setBusy(true)
    try {
      const res = await post('/tracescope/v1/match-page', basePayload())
      const list = (res.candidates || []) as MatchCandidate[]
      setCandidates(list)
      setPhase('matched')
      if (list.length) {
        const first = list[0]!
        setSelectedKey(candidateKey(first))
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function compare() {
    setError('')
    const c = candidates.find((x) => candidateKey(x) === selectedKey)
    if (!c) {
      setError('请选择要对比的页面')
      return
    }
    setBusy(true)
    try {
      const res = await post('/tracescope/v1/visual-compare', {
        ...basePayload(),
        adapterId: c.adapterId,
        relativePath: c.relativePath,
      })
      setData(res as CompareData)
    } catch (err) {
      setData(null)
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section style={S.card}>
      <strong>UI 走查：设计稿 ↔ 代码</strong>
      <p style={S.hint}>
        连接设计稿后，系统会在当前仓库中自动定位对应的页面（同一页面可能存在多种技术实现），
        再与所选实现进行确定性对比，自动列出尺寸、间距、颜色、字号等差异。无需运行应用，也不依赖模型。
      </p>

      <label style={S.label}>
        设计稿链接
        <input
          style={S.input}
          value={figmaUrl}
          disabled={busy}
          placeholder="https://www.figma.com/design/...?node-id=0-3046"
          onChange={(e) => setFigmaUrl(e.target.value)}
        />
      </label>

      <label style={S.label}>
        访问 Token
        <input
          style={S.input}
          type="password"
          value={figmaToken}
          disabled={busy}
          placeholder="figd_..."
          onChange={(e) => setFigmaToken(e.target.value)}
        />
      </label>

      <button type="button" style={S.primary} disabled={busy} onClick={locate}>
        {busy && phase === 'idle' ? '定位中…' : '自动定位页面'}
      </button>

      {phase === 'matched' ? (
        candidates.length ? (
          <div style={{ marginTop: 12 }}>
            <div style={{ ...S.row, justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600 }}>匹配的页面（默认最佳，可切换）</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
              {candidates.map((c) => {
                const key = candidateKey(c)
                const checked = key === selectedKey
                return (
                  <label
                    key={key}
                    style={{
                      border: '1px solid ' + (checked ? '#0f6e56' : 'var(--dsh-border,#ddd4c5)'),
                      borderRadius: 8,
                      padding: '8px 10px',
                      cursor: 'pointer',
                      background: checked ? '#f2f8f5' : '#fff',
                      fontSize: 12,
                    }}
                  >
                    <div style={{ ...S.row, justifyContent: 'space-between' }}>
                      <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                        <input
                          type="radio"
                          name="visual-page"
                          checked={checked}
                          onChange={() => setSelectedKey(key)}
                        />
                        <strong>
                          {c.kindLabel} · {Math.round(c.score * 100)}%
                        </strong>
                        {!c.precise ? (
                          <span style={S.badge}>暂不支持精确对比</span>
                        ) : null}
                      </span>
                    </div>
                    <div style={{ color: '#6b645a', marginTop: 4 }}>{c.relativePath}</div>
                    {c.reasons.length ? (
                      <div style={{ color: '#8a7f70', marginTop: 2 }}>{c.reasons.join('；')}</div>
                    ) : null}
                  </label>
                )
              })}
            </div>
            <button
              type="button"
              style={{ ...S.primary, marginTop: 10 }}
              disabled={busy}
              onClick={compare}
            >
              {busy ? '对比中…' : '开始对比所选页面'}
            </button>
          </div>
        ) : (
          <p style={{ ...S.hint, color: '#9a6700', marginTop: 10 }}>
            未能在仓库中定位到与设计稿对应的页面。请确认所选仓库根目录正确，或检查设计稿中的文案是否与界面一致。
          </p>
        )
      ) : null}

      {error ? (
        <p style={{ color: '#b42318', margin: '8px 0 0', fontSize: 12 }}>{error}</p>
      ) : null}

      <CompareView data={data} />
    </section>
  )
}

function candidateKey(c: MatchCandidate) {
  return c.adapterId + '::' + c.relativePath
}

const S = {
  card: {
    border: '1px solid var(--dsh-border,#ddd4c5)',
    borderRadius: 12,
    background: '#fff',
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
  },
  hint: { margin: '4px 0 10px', color: '#6b645a', fontSize: 12, lineHeight: 1.5 },
  label: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, marginBottom: 10 },
  input: {
    width: '100%',
    padding: '6px 8px',
    border: '1px solid var(--dsh-border,#d8d0c2)',
    borderRadius: 8,
    fontSize: 13,
    boxSizing: 'border-box',
  },
  primary: {
    padding: '7px 12px',
    borderRadius: 8,
    border: '1px solid #0f6e56',
    background: '#0f6e56',
    color: '#fff',
    fontWeight: 600,
    cursor: 'pointer',
  },
  row: { display: 'flex', alignItems: 'center', gap: 8 },
  badge: {
    fontSize: 11,
    color: '#9a6700',
    background: '#fef0c7',
    borderRadius: 999,
    padding: '1px 7px',
  },
}

function CompareView({ data }: { data: CompareData | null }) {
  if (!data) return null

  // Locator-only implementations: the page was found but cannot be diffed yet.
  if (!data.precise) {
    return (
      <div
        style={{
          marginTop: 12,
          border: '1px solid var(--dsh-border,#ddd4c5)',
          borderRadius: 10,
          padding: 10,
          background: '#faf7f0',
          fontSize: 12,
          color: '#7a5b13',
          lineHeight: 1.5,
        }}
      >
        <strong>{data.page.kindLabel}</strong> · {data.page.relativePath}
        <div style={{ marginTop: 4 }}>
          {data.reason ||
            '该实现以代码方式构建界面，当前版本暂不支持属性级对比。'}
        </div>
      </div>
    )
  }

  const result = data.result
  if (!result) return null

  const sevCounts: Record<string, number> = { high: 0, medium: 0, low: 0 }
  const byNode: Record<string, { name: string; rows: Array<Record<string, unknown>> }> = {}
  const groups: Array<{ name: string; rows: Array<Record<string, unknown>> }> = []
  for (const d of result.diffs) {
    const key = String(d.designNodeId)
    if (!byNode[key]) {
      byNode[key] = { name: String(d.nodeName), rows: [] }
      groups.push(byNode[key]!)
    }
    byNode[key]!.rows.push(d)
    const sev = String(d.severity)
    sevCounts[sev] = (sevCounts[sev] || 0) + 1
  }
  const sevColor: Record<string, string> = {
    high: '#b42318',
    medium: '#9a6700',
    low: '#0f6e56',
  }

  return (
    <div style={{ marginTop: 12 }}>
      <p style={{ color: '#6b645a', fontSize: 12, lineHeight: 1.5 }}>
        {data.page.kindLabel} · 对比节点对 {result.comparedPairs} · 差异{' '}
        {result.diffs.length}（高 {sevCounts.high} / 中 {sevCounts.medium} / 低{' '}
        {sevCounts.low}）· 未匹配 {result.unmatched.length}
      </p>

      {groups.length === 0 && result.unmatched.length === 0 ? (
        <p style={{ color: '#0f6e56' }}>没有发现差异。</p>
      ) : null}

      {groups.map((g, gi) => (
        <div
          key={gi}
          style={{
            border: '1px solid var(--dsh-border,#ddd4c5)',
            borderRadius: 10,
            padding: 10,
            marginBottom: 8,
            background: '#fff',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 8,
              marginBottom: 6,
            }}
          >
            <strong>{g.name}</strong>
            <span style={{ fontSize: 12, color: '#6b645a' }}>{g.rows.length} 项差异</span>
          </div>
          {g.rows.map((d, ri) => {
            const property = String(d.property)
            return (
              <div
                key={ri}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 6,
                  border: '1px solid #ece5d8',
                  borderLeft: '4px solid ' + sevColor[String(d.severity)],
                  borderRadius: 8,
                  padding: '4px 8px',
                  marginBottom: 4,
                  fontSize: 12,
                }}
              >
                <span style={{ fontWeight: 600 }}>{PROPERTY_LABELS[property] || property}</span>
                <span
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}
                >
                  <VisualValue value={d.expected} />
                  <span style={{ color: '#0f6e56' }}>→</span>
                  {d.actual === undefined ? (
                    <span style={{ color: '#b42318', fontWeight: 700 }}>
                      {d.needsReview ? '需确认' : '缺失'}
                    </span>
                  ) : (
                    <VisualValue value={d.actual} />
                  )}
                </span>
              </div>
            )
          })}
        </div>
      ))}

      {result.unmatched.length ? (
        <details
          style={{
            border: '1px dashed var(--dsh-border,#ddd4c5)',
            borderRadius: 10,
            padding: '8px 10px',
          }}
        >
          <summary style={{ cursor: 'pointer', color: '#0f6e56', fontWeight: 600 }}>
            未匹配元素（{result.unmatched.length}）
          </summary>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12 }}>
            {result.unmatched.map((u, i) => (
              <li key={i}>
                <span
                  style={{
                    display: 'inline-block',
                    fontSize: 11,
                    borderRadius: 999,
                    padding: '1px 7px',
                    marginRight: 4,
                    background: '#efe8da',
                  }}
                >
                  {u.side === 'design' ? '仅设计稿' : '仅代码'}
                </span>
                {String(u.name)}
                {u.text ? '（' + String(u.text) + '）' : ''}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  )
}

export { PROPERTY_LABELS, VisualValue }
