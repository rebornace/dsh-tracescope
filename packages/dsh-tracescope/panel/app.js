import { t, applyDomI18n, setLang, getLang } from './i18n.js'

const $ = (id) => document.getElementById(id)

const state = {
  report: null,
  markdown: '',
  csv: '',
}

function setError(msg) {
  const el = $('formError')
  if (!msg) {
    el.hidden = true
    el.textContent = ''
    return
  }
  el.hidden = false
  el.textContent = msg
}

function fillCommitSelect(select, commits, preferredIndex) {
  select.innerHTML = ''
  if (!commits.length) {
    const opt = document.createElement('option')
    opt.value = ''
    opt.textContent = t('err.noCommits')
    select.appendChild(opt)
    select.disabled = true
    return
  }
  for (const c of commits) {
    const opt = document.createElement('option')
    opt.value = c.sha
    opt.textContent = `${c.short} · ${c.subject} · ${c.date}`
    select.appendChild(opt)
  }
  select.disabled = false
  select.selectedIndex = Math.min(preferredIndex, commits.length - 1)
}

async function loadCommits() {
  setError('')
  const repoPath = $('repoPath').value.trim()
  if (!repoPath) {
    setError(t('err.needRepo'))
    return
  }
  $('btnLoadCommits').disabled = true
  try {
    const res = await fetch(
      `/api/commits?repoPath=${encodeURIComponent(repoPath)}&limit=50&lang=${getLang()}`,
      { headers: { 'accept-language': getLang() === 'en' ? 'en' : 'zh' } },
    )
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || t('err.loadFailed'))
    fillCommitSelect($('baseCommit'), data.commits, Math.min(1, data.commits.length - 1))
    fillCommitSelect($('headCommit'), data.commits, 0)
    $('btnAnalyze').disabled = data.commits.length < 1
  } catch (err) {
    setError(err.message || String(err))
    $('btnAnalyze').disabled = true
  } finally {
    $('btnLoadCommits').disabled = false
  }
}

function renderItems(container, items) {
  container.innerHTML = ''
  if (!items.length) {
    container.innerHTML = `<p class="hint">${escapeHtml(t('err.emptyClass'))}</p>`
    return
  }
  for (const item of items) {
    const el = document.createElement('article')
    el.className = 'item'
    el.dataset.id = item.id
    el.innerHTML = `
      <div class="item-top">
        <div>
          <h3>${escapeHtml(item.displayName)}</h3>
          <div class="badges">
            <span class="badge ${escapeHtml(item.risk)}">${escapeHtml(t('item.risk'))} ${escapeHtml(item.risk)}</span>
            <span class="badge">${item.kind === 'direct' ? escapeHtml(t('item.direct')) : escapeHtml(t('item.ripple'))}</span>
          </div>
        </div>
        <div class="status-group" data-id="${escapeHtml(item.id)}">
          <button type="button" data-status="pass">${escapeHtml(t('item.pass'))}</button>
          <button type="button" data-status="fail">${escapeHtml(t('item.fail'))}</button>
          <button type="button" data-status="skip">${escapeHtml(t('item.skip'))}</button>
          <button type="button" data-status="pending">${escapeHtml(t('item.reset'))}</button>
        </div>
      </div>
      <ol class="steps">
        ${item.suggestedSteps.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}
      </ol>
      <details class="evidence-box">
        <summary>${escapeHtml(t('item.evidence'))}</summary>
        <ul class="files">${item.files.map((f) => `<li><code>${escapeHtml(f)}</code></li>`).join('')}</ul>
        <ul class="evidence">${item.evidence.map((e) => `<li>${escapeHtml(e.detail)}</li>`).join('')}</ul>
      </details>
    `
    container.appendChild(el)
    syncStatusButtons(el, item.status || 'pending')
  }
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function syncStatusButtons(itemEl, status) {
  itemEl.querySelectorAll('.status-group button').forEach((btn) => {
    btn.classList.remove('active-pass', 'active-fail', 'active-skip')
    if (btn.dataset.status === status && status !== 'pending') {
      btn.classList.add(`active-${status}`)
    }
  })
}

function updateItemStatus(id, status) {
  if (!state.report) return
  for (const list of [state.report.direct, state.report.ripple]) {
    const hit = list.find((i) => i.id === id)
    if (hit) hit.status = status
  }
  document.querySelectorAll(`.item[data-id="${CSS.escape(id)}"]`).forEach((el) => {
    syncStatusButtons(el, status)
  })
}

async function analyze() {
  setError('')
  const payload = {
    repoPath: $('repoPath').value.trim(),
    baseCommit: $('baseCommit').value,
    headCommit: $('headCommit').value,
    rippleDepth: Number($('rippleDepth').value || 2),
    modulesConfigPath: $('modulesConfigPath').value.trim() || undefined,
    exportDir: $('exportDir').value.trim() || undefined,
    lang: getLang(),
  }
  if (!payload.repoPath || !payload.baseCommit || !payload.headCommit) {
    setError(t('err.needVersions'))
    return
  }
  $('btnAnalyze').disabled = true
  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'accept-language': getLang() === 'en' ? 'en' : 'zh',
      },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || t('err.analyzeFailed'))
    state.report = data.report
    state.markdown = data.markdown
    state.csv = data.csv
    $('reportSection').hidden = false
    $('reportMeta').textContent = t('meta.compare', {
      base: payload.baseCommit.slice(0, 7),
      head: payload.headCommit.slice(0, 7),
      files: data.report.changedFiles.length,
      at: new Date(data.report.generatedAt).toLocaleString(),
    })
    renderItems($('listDirect'), data.report.direct)
    renderItems($('listRipple'), data.report.ripple)
    $('reportSection').scrollIntoView({ behavior: 'smooth', block: 'start' })
  } catch (err) {
    setError(err.message || String(err))
  } finally {
    $('btnAnalyze').disabled = false
  }
}

function downloadText(filename, text, mime) {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

async function saveToDisk() {
  if (!state.report) return
  const exportDir = $('exportDir').value.trim()
  if (!exportDir) {
    setError(t('err.needExport'))
    return
  }
  setError('')
  const res = await fetch('/api/export', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'accept-language': getLang() === 'en' ? 'en' : 'zh',
    },
    body: JSON.stringify({ exportDir, report: state.report, lang: getLang() }),
  })
  const data = await res.json()
  if (!res.ok) {
    setError(data.error || t('err.saveFailed'))
    return
  }
  alert(t('saved', { files: (data.files || []).join('\n') }))
}

const PROPERTY_KEYS = {
  width: 'prop.width',
  height: 'prop.height',
  marginTop: 'prop.marginTop',
  marginRight: 'prop.marginRight',
  marginBottom: 'prop.marginBottom',
  marginLeft: 'prop.marginLeft',
  paddingTop: 'prop.paddingTop',
  paddingRight: 'prop.paddingRight',
  paddingBottom: 'prop.paddingBottom',
  paddingLeft: 'prop.paddingLeft',
  backgroundColor: 'prop.backgroundColor',
  borderWidth: 'prop.borderWidth',
  borderColor: 'prop.borderColor',
  cornerRadius: 'prop.cornerRadius',
  opacity: 'prop.opacity',
  fontFamily: 'prop.fontFamily',
  fontSize: 'prop.fontSize',
  fontWeight: 'prop.fontWeight',
  lineHeight: 'prop.lineHeight',
  letterSpacing: 'prop.letterSpacing',
  color: 'prop.color',
}

function setVisualError(msg) {
  const el = $('visualError')
  if (!msg) {
    el.hidden = true
    el.textContent = ''
    return
  }
  el.hidden = false
  el.textContent = msg
}

function formatComparedValue(value) {
  if (value && typeof value === 'object' && value.unresolved) {
    return `<span class="unresolved" title="${escapeHtml(t('visual.unresolved'))}">${escapeHtml(
      t('visual.pending', { raw: value.raw }),
    )}</span>`
  }
  return escapeHtml(String(value))
}

function diffRow(diff) {
  const key = PROPERTY_KEYS[diff.property]
  const label = key ? t(key) : diff.property
  const actualHtml =
    diff.actual === undefined
      ? `<span class="missing">${escapeHtml(t('visual.missing'))}</span>`
      : formatComparedValue(diff.actual)
  const reviewTag = diff.needsReview
    ? `<span class="badge review">${escapeHtml(t('visual.review'))}</span>`
    : ''
  return `
    <div class="diff-row sev-${escapeHtml(diff.severity)}">
      <span class="diff-prop">${escapeHtml(label)}</span>
      <span class="diff-vals">
        <span class="expected">${formatComparedValue(diff.expected)}</span>
        <span class="arrow">→</span>
        <span class="actual">${actualHtml}</span>
      </span>
      ${reviewTag}
    </div>`
}

function renderVisualDiffs(payload) {
  const { result } = payload
  const container = $('visualDiffs')
  container.innerHTML = ''

  const groups = new Map()
  for (const diff of result.diffs) {
    if (!groups.has(diff.designNodeId)) {
      groups.set(diff.designNodeId, { name: diff.nodeName, rows: [] })
    }
    groups.get(diff.designNodeId).rows.push(diff)
  }

  for (const group of groups.values()) {
    const el = document.createElement('article')
    el.className = 'item diff-group'
    el.innerHTML = `
      <div class="item-top">
        <h3>${escapeHtml(group.name)}</h3>
        <span class="badge">${escapeHtml(t('visual.diffCount', { n: group.rows.length }))}</span>
      </div>
      <div class="diff-rows">${group.rows.map(diffRow).join('')}</div>`
    container.appendChild(el)
  }

  if (result.unmatched.length) {
    const el = document.createElement('details')
    el.className = 'unmatched-box'
    el.open = true
    const rows = result.unmatched
      .map((u) => {
        const side = u.side === 'design' ? t('visual.designOnly') : t('visual.codeOnly')
        const text = u.text ? `（${escapeHtml(u.text)}）` : ''
        return `<li><span class="badge">${escapeHtml(side)}</span> ${escapeHtml(u.name)} ${text}</li>`
      })
      .join('')
    el.innerHTML = `<summary>${escapeHtml(
      t('visual.unmatched', { n: result.unmatched.length }),
    )}</summary><ul class="files">${rows}</ul>`
    container.appendChild(el)
  }

  if (!result.diffs.length && !result.unmatched.length) {
    container.innerHTML = `<p class="hint">${escapeHtml(t('visual.noDiff'))}</p>`
  }
}

async function runVisualCompare() {
  setVisualError('')
  const payload = {
    figmaUrl: $('figmaUrl').value.trim(),
    figmaToken: $('figmaToken').value.trim(),
    codePath: $('visualCodePath').value.trim(),
    lang: getLang(),
  }
  if (!payload.figmaUrl || !payload.figmaToken || !payload.codePath) {
    setVisualError(t('err.needVisual'))
    return
  }
  $('btnVisualCompare').disabled = true
  try {
    const res = await fetch('/api/visual-compare', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'accept-language': getLang() === 'en' ? 'en' : 'zh',
      },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || t('err.visualFailed'))

    $('visualResult').hidden = false
    const sevCounts = { high: 0, medium: 0, low: 0 }
    for (const d of data.result.diffs) sevCounts[d.severity] = (sevCounts[d.severity] || 0) + 1
    $('visualMeta').textContent = t('visual.meta', {
      kind: data.codeKind === 'uikit' ? 'iOS xib' : 'Android XML',
      pairs: data.result.comparedPairs,
      diffs: data.result.diffs.length,
      high: sevCounts.high,
      medium: sevCounts.medium,
      low: sevCounts.low,
      unmatched: data.result.unmatched.length,
      dimens: data.resourceCounts.dimens,
      colors: data.resourceCounts.colors,
    })
    renderVisualDiffs(data)
    $('visualResult').scrollIntoView({ behavior: 'smooth', block: 'start' })
  } catch (err) {
    setVisualError(err.message || String(err))
  } finally {
    $('btnVisualCompare').disabled = false
  }
}

function wireTabs() {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'))
      tab.classList.add('active')
      const which = tab.dataset.tab
      $('listDirect').hidden = which !== 'direct'
      $('listRipple').hidden = which !== 'ripple'
    })
  })
}

async function boot() {
  setLang(getLang())
  applyDomI18n()
  wireTabs()
  $('btnLoadCommits').addEventListener('click', loadCommits)
  $('btnAnalyze').addEventListener('click', analyze)
  $('btnExportMd').addEventListener('click', () => {
    if (state.markdown) downloadText('tracescope-report.md', state.markdown, 'text/markdown')
  })
  $('btnExportCsv').addEventListener('click', () => {
    if (state.csv) downloadText('tracescope-report.csv', state.csv, 'text/csv')
  })
  $('btnSaveDisk').addEventListener('click', saveToDisk)
  $('btnVisualCompare').addEventListener('click', runVisualCompare)

  document.addEventListener('click', (ev) => {
    const btn = ev.target.closest('.status-group button')
    if (!btn) return
    const id = btn.parentElement?.dataset.id
    const status = btn.dataset.status
    if (id && status) updateItemStatus(id, status)
  })

  try {
    const res = await fetch('/api/health', {
      headers: { 'accept-language': getLang() === 'en' ? 'en' : 'zh' },
    })
    const data = await res.json()
    $('serverStatus').textContent = data.ok ? t('status.ready') : t('status.error')
  } catch {
    $('serverStatus').textContent = t('status.offline')
  }

  const saved = localStorage.getItem('tracescope.repoPath')
  if (saved) $('repoPath').value = saved
  $('repoPath').addEventListener('change', () => {
    localStorage.setItem('tracescope.repoPath', $('repoPath').value.trim())
  })
}

boot()
