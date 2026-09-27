import { useEffect, useState } from 'react'
import { VisualDiffBoard } from './VisualDiffBoard.js'

interface MatchCandidate {
  adapterId: string
  platform: string
  kindLabel: string
  relativePath: string
  precise: boolean
  score: number
  reasons: string[]
}

interface WireNode {
  id: string
  name: string
  kind: string
  text?: string
  box: { x?: number; y?: number; width?: number; height?: number }
  style: {
    backgroundColor?: string
    color?: string
    fontSize?: number
    fontWeight?: number
    cornerRadius?: number
  }
  children: WireNode[]
}

interface VisualDiff {
  designNodeId: string
  codeNodeId?: string
  nodeName: string
  property: string
  expected: unknown
  actual?: unknown
  severity: 'high' | 'medium' | 'low'
  needsReview?: boolean
}

interface CompareData {
  page: { adapterId: string; kindLabel: string; relativePath: string; precise: boolean }
  precise: boolean
  reason?: string
  result?: {
    diffs: VisualDiff[]
    unmatched: Array<{ id: string; name: string; side: 'design' | 'code'; text?: string }>
    comparedPairs: number
  }
  designImageUrl?: string
  frameBox?: { x: number; y: number; width: number; height: number }
  designTree?: WireNode
  codeTree?: WireNode
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

export interface VisualComparePanelProps {
  repoInput: string
  auth?: unknown
}

// Persist the design connection per code folder so reopening the panel (or the
// app) does not force re-entering the Figma link/token.
const UI_CONFIG_PREFIX = 'tracescope.ui.'
const UI_CONFIG_FIGMA_URL = 'figmaUrl'
const UI_CONFIG_FIGMA_TOKEN = 'figmaToken'

function uiStorageKey(repoInput: string, field: string) {
  return UI_CONFIG_PREFIX + field + ':' + repoInput.trim()
}

function readUiConfig(repoInput: string, field: string) {
  try {
    return localStorage.getItem(uiStorageKey(repoInput, field)) ?? ''
  } catch {
    return ''
  }
}

function writeUiConfig(repoInput: string, field: string, value: string) {
  try {
    if (value) localStorage.setItem(uiStorageKey(repoInput, field), value)
    else localStorage.removeItem(uiStorageKey(repoInput, field))
  } catch {
    /* storage unavailable: session-only */
  }
}

export function VisualComparePanel({ repoInput, auth }: VisualComparePanelProps) {
  const [figmaUrl, setFigmaUrlState] = useState(() => readUiConfig(repoInput, UI_CONFIG_FIGMA_URL))
  const [figmaToken, setFigmaTokenState] = useState(() =>
    readUiConfig(repoInput, UI_CONFIG_FIGMA_TOKEN),
  )
  const [busy, setBusy] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'matched'>('idle')
  const [candidates, setCandidates] = useState<MatchCandidate[]>([])
  const [selectedKey, setSelectedKey] = useState('')
  const [data, setData] = useState<CompareData | null>(null)
  const [error, setError] = useState('')
  const [designNodeName, setDesignNodeName] = useState('')

  const setFigmaUrl = (value: string) => {
    setFigmaUrlState(value)
    writeUiConfig(repoInput, UI_CONFIG_FIGMA_URL, value.trim())
  }
  const setFigmaToken = (value: string) => {
    setFigmaTokenState(value)
    writeUiConfig(repoInput, UI_CONFIG_FIGMA_TOKEN, value.trim())
  }

  // Reload this folder's saved design connection when the code folder changes,
  // and clear the previous folder's match/compare results.
  useEffect(() => {
    setFigmaUrlState(readUiConfig(repoInput, UI_CONFIG_FIGMA_URL))
    setFigmaTokenState(readUiConfig(repoInput, UI_CONFIG_FIGMA_TOKEN))
    setCandidates([])
    setSelectedKey('')
    setData(null)
    setPhase('idle')
    setError('')
    setDesignNodeName('')
  }, [repoInput])

  const basePayload = () => ({
    repoPath: repoInput,
    auth,
    figmaUrl: figmaUrl.trim(),
    figmaToken: figmaToken.trim(),
  })

  async function locate() {
    setError('')
    setData(null)
    setDesignNodeName('')
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
      setDesignNodeName(typeof res.designNodeName === 'string' ? res.designNodeName : '')
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
        ) : designNodeName ? (
          <div style={{ ...S.hint, color: '#9a6700', marginTop: 10, lineHeight: 1.7 }}>
            当前链接指向的节点「{designNodeName}」是一个<strong>空白图层（不含任何文案或控件）</strong>，
            无法对应到代码页面。
            <br />
            请在 Figma 中点击真正的<strong>画板 / 界面 Frame</strong>（通常包含整屏内容，而非某个矩形、图片等子元素），
            右键选择「Copy link to selection」后重新粘贴。
          </div>
        ) : (
          <div style={{ ...S.hint, color: '#9a6700', marginTop: 10, lineHeight: 1.7 }}>
            未能在仓库中定位到与设计稿对应的页面。请确认：
            <br />
            1）所选代码文件夹根目录正确；
            <br />
            2）复制链接时选中的是完整画板，而不是画板内的某个分组 / 子元素；
            <br />
            3）设计稿中的文案与界面实际文案一致。
          </div>
        )
      ) : null}

      {error ? (
        <p style={{ color: '#b42318', margin: '8px 0 0', fontSize: 12 }}>{error}</p>
      ) : null}

      {data && !data.precise ? (
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
            {data.reason || '该实现以代码方式构建界面，当前版本暂不支持属性级对比。'}
          </div>
        </div>
      ) : null}
      {data && data.precise && data.result ? <VisualDiffBoard data={data} /> : null}
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

