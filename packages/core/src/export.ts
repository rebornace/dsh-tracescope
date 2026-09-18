import type { ImpactReport, ScopeItem } from './types.js'

function renderScreenshots(item: ScopeItem): string[] {
  const shots = item.testerScreenshots || []
  if (!shots.length || item.status !== 'fail') return []
  const lines = [`- 截图（${shots.length}）：`]
  shots.forEach((s, i) => {
    lines.push(`  ${i + 1}. ${s.name}`)
    lines.push(`  ![${s.name}](${s.dataUrl})`)
  })
  lines.push('')
  return lines
}

function renderItem(item: ScopeItem, idx: number): string {
  const files = item.files.map((f) => `  - \`${f}\``).join('\n')
  const evidence = item.evidence.map((e) => `  - (${e.code}) ${e.detail}`).join('\n')
  const steps = item.suggestedSteps.map((s, i) => `  ${i + 1}. ${s}`).join('\n')
  const note =
    item.status === 'fail' && item.testerNote?.trim()
      ? [`- 测试备注（给开发）：`, `  ${item.testerNote.trim()}`, '']
      : []
  return [
    `### ${idx}. ${item.displayName}`,
    '',
    `- 状态：\`${item.status}\``,
    `- 类型：\`${item.kind}\``,
    `- 风险：\`${item.risk}\``,
    ...note,
    ...renderScreenshots(item),
    `- 相关文件：`,
    files || '  - （无）',
    `- 证据：`,
    evidence || '  - （无）',
    `- 建议手测：`,
    steps,
    '',
  ].join('\n')
}

function renderFailFeedback(report: ImpactReport): string[] {
  const failed = [...report.direct, ...report.ripple].filter((i) => i.status === 'fail')
  if (!failed.length) return []
  const lines = ['## 失败反馈（给开发）', '']
  failed.forEach((item, i) => {
    lines.push(`${i + 1}. **${item.displayName}**（${item.kind} / 风险 ${item.risk}）`)
    if (item.files.length) {
      lines.push(`   - 文件：${item.files.map((f) => `\`${f}\``).join(', ')}`)
    }
    lines.push(`   - 备注：${item.testerNote?.trim() || '（测试未填写备注）'}`)
    const shots = item.testerScreenshots || []
    if (shots.length) {
      lines.push(`   - 截图：${shots.map((s) => s.name).join('、')}`)
      shots.forEach((s) => {
        lines.push(`     ![${s.name}](${s.dataUrl})`)
      })
    }
    lines.push('')
  })
  return lines
}

export function exportReportMarkdown(report: ImpactReport): string {
  const lines = [
    `# TraceScope 手测范围报告`,
    '',
    `- 仓库：\`${report.repoPath}\``,
    `- 稳定基线：\`${report.baseCommit}\``,
    `- 待测提交：\`${report.headCommit}\``,
    `- 生成时间：${report.generatedAt}`,
    `- 模型对比：${report.modelEnriched ? '是' : '否（确定性分析）'}`,
    `- 变更文件数：${report.changedFiles.length}`,
    '',
  ]

  const attachments = report.attachments || []
  if (attachments.length) {
    lines.push('## 任务附件', '')
    attachments.forEach((a, i) => {
      const sizeLabel =
        a.size >= 1024 * 1024
          ? `${(a.size / (1024 * 1024)).toFixed(1)} MB`
          : `${Math.max(1, Math.round(a.size / 1024))} KB`
      lines.push(`${i + 1}. **${a.name}**（${a.mime || 'file'} · ${sizeLabel}）`)
    })
    lines.push('')
  }

  lines.push(`## 直接变更`, '')

  if (report.direct.length === 0) {
    lines.push('_无直接变更项_', '')
  } else {
    report.direct.forEach((item, i) => lines.push(renderItem(item, i + 1)))
  }

  lines.push(`## 可能波及（依赖扩散）`, '')
  if (report.ripple.length === 0) {
    lines.push('_无波及项_', '')
  } else {
    report.ripple.forEach((item, i) => lines.push(renderItem(item, i + 1)))
  }

  lines.push(...renderFailFeedback(report))

  lines.push(`## 变更文件清单`, '')
  for (const f of report.changedFiles) {
    lines.push(`- \`${f}\``)
  }
  lines.push('')
  return lines.join('\n')
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

export function exportReportCsv(report: ImpactReport): string {
  const header = [
    'id',
    'displayName',
    'kind',
    'risk',
    'status',
    'testerNote',
    'screenshotCount',
    'files',
    'evidence',
    'suggestedSteps',
  ]
  const rows = [...report.direct, ...report.ripple].map((item) =>
    [
      item.id,
      item.displayName,
      item.kind,
      item.risk,
      item.status,
      item.testerNote ?? '',
      String(item.testerScreenshots?.length ?? 0),
      item.files.join(';'),
      item.evidence.map((e) => e.detail).join(' | '),
      item.suggestedSteps.join(' | '),
    ]
      .map(csvEscape)
      .join(','),
  )
  return [header.join(','), ...rows].join('\n') + '\n'
}
