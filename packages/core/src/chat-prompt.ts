import type { AgileWorkItemRef } from './agile-workitems.js'

/** Build the Chinese starter prompt that TraceScope drops into the session composer. */
export function buildChatAnalysisPrompt(input: {
  jobId: string
  repoPath: string
  baseCommit: string
  headCommit: string
  relatedWorkItems?: AgileWorkItemRef[]
  accessMode?: 'git' | 'codeup'
}): string {
  const related = input.relatedWorkItems ?? []
  const relatedBlock =
    related.length === 0
      ? []
      : [
          '',
          `关联的敏捷工作项（共 ${related.length} 项，请务必覆盖其验收点）：`,
          ...related.map((item, idx) => {
            const cat = item.category ? `[${item.category}] ` : ''
            const desc = item.description
              ? ` — ${item.description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160)}`
              : ''
            return `${idx + 1}. ${cat}${item.subject}（id: ${item.id}）${desc}`
          }),
          '生成清单时：为上述工作项各保留至少一条可勾选手测项，并与本次 diff 变更对齐。',
        ]

  return [
    `请帮我做 TraceScope 手测范围分析（任务 ID: ${input.jobId}）。`,
    '',
    `仓库：${input.repoPath}`,
    `稳定版本（base）：${input.baseCommit}`,
    `待测版本（head）：${input.headCommit}`,
    ...relatedBlock,
    '',
    `请按正常对话方式互动：`,
    input.accessMode === 'codeup'
      ? '仓库通过云效代码接口读取，本机可以没有 git。diff 与清单工具会使用这次任务保存的令牌，不要再要求克隆。'
      : '仓库通过本机 git 读取（工作区或 bare 对象库均可）。',
    '1. 先用 tracescope_list_commits / tracescope_get_diff / tracescope_analyze_impact 了解两个版本之间的真实变更（按需分片拉 diff，不要一次塞爆）。',
    '2. 按用户可感知的功能 / 场景合并问题；可指出静态分析可能漏掉的回归与波及面。',
    '3. 有不确定的范围先问我，再继续。',
    '4. 最终必须调用 tracescope_publish_handtest，把完整手测清单写入任务（不要只口头总结）。',
    '   - jobId 必须原样传入：' + input.jobId,
    '   - items 为 JSON 数组，每项含 displayName、kind(direct|ripple)、risk(high|medium|low)、files、suggestedSteps、evidence。',
    '',
    '完成后我会在右侧 TraceScope 面板自动刷新手测清单。',
  ].join('\n')
}
