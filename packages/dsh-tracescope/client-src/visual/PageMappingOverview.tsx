import { useEffect, useMemo, useState } from 'react'

interface CodeFile {
  adapterId: string
  kindLabel: string
  relativePath: string
  precise: boolean
}

interface Candidate extends CodeFile {
  score: number
  reasons: string[]
}

interface PageMapping {
  designId: string
  designName: string
  kind: 'screen' | 'list-item' | 'dialog'
  status: 'matched' | 'weak' | 'none'
  candidates: Candidate[]
}

interface GroupedPage {
  canvasId: string
  canvasName: string
  mapping: PageMapping
}

interface MatchAllResponse {
  codeFiles: CodeFile[]
  canvases: Array<{ id: string; name: string; componentLibrary: boolean }>
  pages: GroupedPage[]
  totals: { pages: number; matched: number; weak: number; none: number }
}

export interface SelectedCodeFile {
  adapterId: string
  relativePath: string
}

const KIND_BADGE: Record<PageMapping['kind'], { label: string; bg: string }> = {
  screen: { label: '整屏', bg: '#e7f0fb' },
  'list-item': { label: '列表项', bg: '#ece8fa' },
  dialog: { label: '弹窗', bg: '#fdeede' },
}

const STATUS_DOT: Record<PageMapping['status'], string> = {
  matched: '#1a9b6e',
  weak: '#dc8a05',
  none: '#d92d20',
}

function storageKey(repoInput: string, figmaUrl: string) {
  return 'tracescope.map.selections:' + repoInput.trim() + ':' + figmaUrl.trim()
}

function loadSelections(repoInput: string, figmaUrl: string): Record<string, SelectedCodeFile> {
  try {
    return JSON.parse(localStorage.getItem(storageKey(repoInput, figmaUrl)) ?? '{}')
  } catch {
    return {}
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
  return data as MatchAllResponse
}

export interface PageMappingOverviewProps {
  repoInput: string
  figmaUrl: string
  figmaToken: string
  auth?: unknown
  busy: boolean
  onScanStateChange: (busy: boolean) => void
  onCompare: (designId: string, codeFile: SelectedCodeFile) => void
}

export function PageMappingOverview({
  repoInput,
  figmaUrl,
  figmaToken,
  auth,
  busy,
  onScanStateChange,
  onCompare,
}: PageMappingOverviewProps) {
  const [overview, setOverview] = useState<MatchAllResponse | null>(null)
  const [selections, setSelections] = useState<Record<string, SelectedCodeFile>>(() =>
    loadSelections(repoInput, figmaUrl),
  )
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({})
  const [openId, setOpenId] = useState('')
  const [search, setSearch] = useState('')
  const [localError, setLocalError] = useState('')

  // Reset cached result when the inputs change.
  useEffect(() => {
    setOverview(null)
    setSelections(loadSelections(repoInput, figmaUrl))
    setConfirmed({})
    setOpenId('')
  }, [repoInput, figmaUrl])

  function persist(next: Record<string, SelectedCodeFile>) {
    setSelections(next)
    try {
      localStorage.setItem(storageKey(repoInput, figmaUrl), JSON.stringify(next))
    } catch {
      /* storage unavailable */
    }
  }

  async function scan() {
    setLocalError('')
    if (!figmaUrl.trim() || !figmaToken.trim()) {
      setLocalError('请填写设计稿链接和访问 Token')
      return
    }
    onScanStateChange(true)
    try {
      const res = await post('/tracescope/v1/match-all', {
        repoPath: repoInput,
        figmaUrl: figmaUrl.trim(),
        figmaToken: figmaToken.trim(),
        auth,
      })
      setOverview(res)
      // Default each page to its best auto candidate when nothing is chosen.
      const next = { ...selections }
      for (const p of res.pages) {
        const top = p.mapping.candidates[0]
        if (!next[p.mapping.designId] && top) {
          next[p.mapping.designId] = {
            adapterId: top.adapterId,
            relativePath: top.relativePath,
          }
        }
      }
      persist(next)
    } catch (err) {
      setLocalError((err as Error).message)
    } finally {
      onScanStateChange(false)
    }
  }

  const codeFileMap = useMemo(() => {
    const m = new Map<string, CodeFile>()
    overview?.codeFiles.forEach((f) => m.set(f.adapterId + '::' + f.relativePath, f))
    return m
  }, [overview])

  function choose(designId: string, file: SelectedCodeFile, auto = false) {
    persist({ ...selections, [designId]: file })
    if (!auto) setConfirmed({ ...confirmed, [designId]: true })
    setOpenId('')
    setSearch('')
  }

  // Group pages by canvas (component libraries have no pages in the list).
  const groups = useMemo(() => {
    if (!overview) return []
    const byCanvas = new Map<string, { name: string; items: GroupedPage[] }>()
    for (const p of overview.pages) {
      const g = byCanvas.get(p.canvasId) ?? { name: p.canvasName, items: [] }
      g.items.push(p)
      byCanvas.set(p.canvasId, g)
    }
    return [...byCanvas.entries()].map(([id, v]) => ({ id, ...v }))
  }, [overview])

  const filteredCodeFiles = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q || !overview) return []
    return overview.codeFiles.filter((f) => f.relativePath.toLowerCase().includes(q)).slice(0, 40)
  }, [search, overview])

  return (
    <div>
      <button type="button" style={OV.scan} disabled={busy} onClick={scan}>
        {busy ? '扫描中…' : overview ? '重新扫描整个设计文件' : '扫描整个设计文件，自动映射页面'}
      </button>

      {localError ? <p style={OV.error}>{localError}</p> : null}

      {overview ? (
        <div style={{ marginTop: 10 }}>
          <div style={OV.summary}>
            共 {overview.totals.pages} 个页面 ·
            <span style={{ color: STATUS_DOT.matched }}> 高置信 {overview.totals.matched}</span> ·
            <span style={{ color: STATUS_DOT.weak }}> 待确认 {overview.totals.weak}</span> ·
            <span style={{ color: STATUS_DOT.none }}> 未匹配 {overview.totals.none}</span>
          </div>

          {groups.map((g) => (
            <div key={g.id} style={OV.canvasCard}>
              <div style={OV.canvasTitle}>{g.name}</div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {g.items.map(({ mapping }) => (
                  <PageRow
                    key={mapping.designId}
                    mapping={mapping}
                    selected={selections[mapping.designId]}
                    isConfirmed={!!confirmed[mapping.designId]}
                    open={openId === mapping.designId}
                    search={openId === mapping.designId ? search : ''}
                    filteredCodeFiles={openId === mapping.designId ? filteredCodeFiles : []}
                    onToggle={() => {
                      setOpenId(openId === mapping.designId ? '' : mapping.designId)
                      setSearch('')
                    }}
                    onSearchChange={setSearch}
                    onChoose={(file) => choose(mapping.designId, file)}
                    onCompare={() => {
                      const file = selections[mapping.designId]
                      if (file) onCompare(mapping.designId, file)
                    }}
                    codeFileMap={codeFileMap}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

interface PageRowProps {
  mapping: PageMapping
  selected?: SelectedCodeFile
  isConfirmed: boolean
  open: boolean
  search: string
  filteredCodeFiles: CodeFile[]
  onToggle: () => void
  onSearchChange: (v: string) => void
  onChoose: (file: SelectedCodeFile) => void
  onCompare: () => void
  codeFileMap: Map<string, CodeFile>
}

function PageRow({
  mapping,
  selected,
  isConfirmed,
  open,
  search,
  filteredCodeFiles,
  onToggle,
  onSearchChange,
  onChoose,
  onCompare,
  codeFileMap,
}: PageRowProps) {
  const selFile = selected
    ? codeFileMap.get(selected.adapterId + '::' + selected.relativePath)
    : undefined
  const badge = KIND_BADGE[mapping.kind]
  const selCandidate = mapping.candidates.find(
    (c) =>
      selected && c.adapterId === selected.adapterId && c.relativePath === selected.relativePath,
  )

  return (
    <div style={OV.row}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ width: 8, height: 8, borderRadius: 99, background: STATUS_DOT[mapping.status], display: 'inline-block' }} />
        <span style={{ ...OV.kindBadge, background: badge.bg }}>{badge.label}</span>
        <strong style={{ fontSize: 12 }}>{mapping.designName}</strong>
      </div>

      <button type="button" style={OV.selectedBox} onClick={onToggle}>
        {selFile ? (
          <span title={selFile.relativePath}>
            {isConfirmed ? '✓ ' : ''}
            {selFile.relativePath.split('/').pop()}
            {selCandidate ? ` · ${Math.round(selCandidate.score * 100)}%` : ''}
          </span>
        ) : (
          <span style={{ color: '#b42318' }}>未选择，点此指定 →</span>
        )}
      </button>

      {open ? (
        <div style={OV.picker}>
          <div style={OV.pickerLabel}>自动建议</div>
          {mapping.candidates.length ? (
            mapping.candidates.map((c) => (
              <button
                key={c.adapterId + c.relativePath}
                type="button"
                style={OV.pickItem}
                onClick={() => onChoose({ adapterId: c.adapterId, relativePath: c.relativePath })}
              >
                <span>{Math.round(c.score * 100)}%</span>
                <span style={{ flex: 1, textAlign: 'left', color: '#3f3a30' }}>{c.relativePath}</span>
              </button>
            ))
          ) : (
            <div style={OV.pickerLabel}>无自动建议，请在下方搜索。</div>
          )}

          <input
            style={OV.searchInput}
            value={search}
            placeholder="在全部布局文件中搜索…"
            onChange={(e) => onSearchChange(e.target.value)}
          />
          {filteredCodeFiles.map((f) => (
            <button
              key={f.adapterId + f.relativePath}
              type="button"
              style={OV.pickItem}
              onClick={() => onChoose({ adapterId: f.adapterId, relativePath: f.relativePath })}
            >
              <span style={{ flex: 1, textAlign: 'left', color: '#3f3a30' }}>{f.relativePath}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div>
        <button type="button" style={OV.compareBtn} disabled={!selected} onClick={onCompare}>
          对比
        </button>
      </div>
    </div>
  )
}

const OV: Record<string, React.CSSProperties> = {
  scan: {
    width: '100%',
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid #0f6e56',
    background: '#0f6e56',
    color: '#fff',
    fontWeight: 600,
    cursor: 'pointer',
  },
  error: { color: '#b42318', fontSize: 12, marginTop: 6 },
  summary: { fontSize: 12, color: '#5f584c', marginBottom: 8 },
  canvasCard: {
    border: '1px solid var(--dsh-border,#ddd4c5)',
    borderRadius: 10,
    marginBottom: 8,
    overflow: 'hidden',
    background: '#fff',
  },
  canvasTitle: {
    fontSize: 12,
    fontWeight: 600,
    padding: '6px 10px',
    background: '#f6f2e9',
    color: '#5f584c',
  },
  row: {
    borderTop: '1px solid #f0eadd',
    padding: '8px 10px',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  kindBadge: {
    fontSize: 10,
    borderRadius: 999,
    padding: '1px 7px',
    color: '#3f3a30',
  },
  selectedBox: {
    textAlign: 'left',
    fontSize: 12,
    border: '1px solid #d9d2c4',
    borderRadius: 8,
    padding: '5px 8px',
    background: '#fcfaf6',
    cursor: 'pointer',
    color: '#3f3a30',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  picker: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    border: '1px solid #e6dfd0',
    borderRadius: 8,
    padding: 6,
    background: '#fdfbf7',
  },
  pickerLabel: { fontSize: 11, color: '#8a7f70' },
  pickItem: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    fontSize: 11,
    border: '1px solid #ece5d8',
    borderRadius: 6,
    padding: '4px 8px',
    background: '#fff',
    cursor: 'pointer',
    color: '#0f6e56',
    fontWeight: 600,
  },
  searchInput: {
    padding: '5px 8px',
    border: '1px solid #d9d2c4',
    borderRadius: 6,
    fontSize: 12,
  },
  compareBtn: {
    fontSize: 12,
    padding: '4px 14px',
    borderRadius: 7,
    border: '1px solid #0f6e56',
    background: '#fff',
    color: '#0f6e56',
    fontWeight: 600,
    cursor: 'pointer',
  },
}
