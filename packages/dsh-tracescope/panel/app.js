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
    opt.textContent = '没有读到提交'
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
    setError('请先填写项目文件夹路径')
    return
  }
  $('btnLoadCommits').disabled = true
  try {
    const res = await fetch(`/api/commits?repoPath=${encodeURIComponent(repoPath)}&limit=50`)
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || '加载失败')
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
    container.innerHTML = '<p class="hint">这一类暂时没有条目。</p>'
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
            <span class="badge ${escapeHtml(item.risk)}">风险 ${escapeHtml(item.risk)}</span>
            <span class="badge">${item.kind === 'direct' ? '直接变更' : '可能波及'}</span>
          </div>
        </div>
        <div class="status-group" data-id="${escapeHtml(item.id)}">
          <button type="button" data-status="pass">通过</button>
          <button type="button" data-status="fail">失败</button>
          <button type="button" data-status="skip">跳过</button>
          <button type="button" data-status="pending">重置</button>
        </div>
      </div>
      <ol class="steps">
        ${item.suggestedSteps.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}
      </ol>
      <details class="evidence-box">
        <summary>查看证据（文件 / 原因）</summary>
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
  }
  if (!payload.repoPath || !payload.baseCommit || !payload.headCommit) {
    setError('请完整选择项目路径和两个版本')
    return
  }
  $('btnAnalyze').disabled = true
  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || '分析失败')
    state.report = data.report
    state.markdown = data.markdown
    state.csv = data.csv
    $('reportSection').hidden = false
    $('reportMeta').textContent =
      `对照 ${payload.baseCommit.slice(0, 7)} → 待测 ${payload.headCommit.slice(0, 7)} · 变更文件 ${data.report.changedFiles.length} · 生成于 ${new Date(data.report.generatedAt).toLocaleString()}`
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
    setError('请先在高级选项里填写导出目录')
    return
  }
  setError('')
  const res = await fetch('/api/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ exportDir, report: state.report }),
  })
  const data = await res.json()
  if (!res.ok) {
    setError(data.error || '保存失败')
    return
  }
  alert(`已保存：\n${(data.files || []).join('\n')}`)
}

function wireTabs() {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'))
      tab.classList.add('active')
      const which = tab.dataset.tab
      $('listDirect').hidden = which !== 'direct'
      $('listRipple').hidden = which !== 'ripple'
    })
  })
}

async function boot() {
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

  document.addEventListener('click', (ev) => {
    const btn = ev.target.closest('.status-group button')
    if (!btn) return
    const id = btn.parentElement?.dataset.id
    const status = btn.dataset.status
    if (id && status) updateItemStatus(id, status)
  })

  try {
    const res = await fetch('/api/health')
    const data = await res.json()
    $('serverStatus').textContent = data.ok ? '面板已就绪' : '服务异常'
  } catch {
    $('serverStatus').textContent = '无法连接本地服务'
  }

  const saved = localStorage.getItem('tracescope.repoPath')
  if (saved) $('repoPath').value = saved
  $('repoPath').addEventListener('change', () => {
    localStorage.setItem('tracescope.repoPath', $('repoPath').value.trim())
  })
}

boot()
