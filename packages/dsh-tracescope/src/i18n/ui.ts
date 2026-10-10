/**
 * Non-error user-visible strings (sidebar notes, labels, agent summaries).
 * Canonical Chinese keys; English when lang === 'en'.
 */
import type { Lang } from './lang.js'
import { langFromBody } from './lang.js'

export const UI_MESSAGES: Record<string, { zh: string; en: string }> = {
  AI_RECOMMEND: { zh: 'AI 推荐', en: 'AI recommendation' },
  AI_PREFIX: { zh: 'AI：{reason}', en: 'AI: {reason}' },
  CURRENT_LINK_NODE: { zh: '当前链接节点', en: 'Linked node' },
  CURRENT_LANHU_DESIGN: { zh: '当前蓝湖设计稿', en: 'Current Lanhu design' },
  LANHU_PROJECT: { zh: '蓝湖项目', en: 'Lanhu project' },
  NOTE_LABEL: { zh: '备注', en: 'Note' },
  HEURISTIC_DONE: {
    zh: '{kind} 已完成启发式静态对比；属性级几何对比可后续加深。',
    en: '{kind} heuristic static compare done; property-level geometry can be deepened later.',
  },
  NO_ADAPTER: {
    zh: '该页面缺少可用的对比适配器。',
    en: 'This page has no usable compare adapter.',
  },
  NOTE_SEEDED: {
    zh: '；列表占位文案已静态填入 {n} 处设计稿文案',
    en: '; list placeholders filled with {n} design copy snippets',
  },
  NOTE_INLINE_MODULES: {
    zh: '{kind} 属性级静态对比（无运行时渲染）；已内联 {inlined} 个关联模块参与对比{extra}{seed}。',
    en: '{kind} property-level static compare (no runtime render); inlined {inlined} related modules{extra}{seed}.',
  },
  NOTE_INLINE_EXTRA: {
    zh: '，另有 {n} 个关联文件供 AI 阅读',
    en: ', plus {n} related files for AI',
  },
  NOTE_RELATED_FILES: {
    zh: '{kind} 属性级静态对比（无运行时渲染）；已识别 {n} 个关联文件供 AI 阅读{seed}。',
    en: '{kind} property-level static compare (no runtime render); found {n} related files for AI{seed}.',
  },
  NOTE_STATIC_ONLY: {
    zh: '{kind} 属性级静态对比（无运行时渲染）{seed}。',
    en: '{kind} property-level static compare (no runtime render){seed}.',
  },
  NOTE_HEURISTIC_WITH_RELATED: {
    zh: '{kind} 已做启发式静态对比（文案/控件规模，含 {n} 个关联文件）；属性级几何对比尚未覆盖的部分可用「AI 协助分析」。',
    en: '{kind} heuristic static compare done (copy/control scale, {n} related files); use “AI assist” for uncovered geometry.',
  },
  NOTE_HEURISTIC: {
    zh: '{kind} 已做启发式静态对比（文案/控件规模）；属性级几何对比尚未覆盖的部分可用「AI 协助分析」。',
    en: '{kind} heuristic static compare done (copy/control scale); use “AI assist” for uncovered geometry.',
  },
  BRANCH_CURRENT: { zh: '当前分支：{branch}', en: 'Current branch: {branch}' },
  WORKTREE_CLEAN: { zh: '工作区干净，无未提交改动。', en: 'Working tree clean; no uncommitted changes.' },
  LAST_COMMIT: { zh: '该入口文件最近一次提交：{info}', en: 'Latest commit for this entry file: {info}' },
  ANDROID_REF_ENTRY: {
    zh: '引用入口 layout 的 Activity/Fragment/Adapter',
    en: 'Activity/Fragment/Adapter referencing the entry layout',
  },
  LIST_RESTORED: {
    zh: '已按代码自身的 item 布局还原 {n} 个列表',
    en: 'Restored {n} lists from the code’s own item layouts',
  },
  LIST_RESTORED_RUNTIME: {
    zh: '已按代码自身的 item 布局还原 {n} 个运行时列表（共 {total} 个动态区域）',
    en: 'Restored {n} runtime lists from item layouts ({total} dynamic regions)',
  },
  LIST_PROJECTED_EXTRA: {
    zh: '，另有 {n} 个区域未找到 item 布局、暂以设计稿内容示意',
    en: '; {n} regions lacked item layouts and use design content as placeholders',
  },
  LIST_PROJECTED_ONLY: {
    zh: '未从代码解析到 item 布局，已用设计稿内容示意 {n} 个区域（可在聊天中让 AI 协助）。',
    en: 'No item layouts parsed from code; showing {n} regions from design (ask AI in chat to help).',
  },
  LIST_NONE: {
    zh: '未识别到可填充的运行时区域。',
    en: 'No fillable runtime regions detected.',
  },
  // Agent summaries
  AGENT_HANDTEST_CREATED: {
    zh: '已创建手测分析任务 {id}',
    en: 'Created hand-test analysis job {id}',
  },
  AGENT_REPO: { zh: '仓库 {repo}', en: 'Repo {repo}' },
  AGENT_BASE_HEAD: {
    zh: '基线 {base} → 待测 {head}',
    en: 'Baseline {base} → under test {head}',
  },
  AGENT_HANDTEST_NEXT: {
    zh: '请按下方提示词分析，完成后调用 tracescope_publish_handtest 写回清单。',
    en: 'Follow the prompt below, then call tracescope_publish_handtest to write back the checklist.',
  },
  AGENT_HANDTEST_PUBLISHED: {
    zh: '已发布验证清单到 TraceScope 面板（任务 {id}）',
    en: 'Published checklist to the TraceScope panel (job {id})',
  },
  AGENT_CRASH_CREATED: {
    zh: '已创建崩溃分析任务 {id}',
    en: 'Created crash analysis job {id}',
  },
  AGENT_CRASH_NEXT: {
    zh: '请按下方提示词分析，完成后必须调用 tracescope_publish_crash_analysis 写回侧栏结论。',
    en: 'Follow the prompt below, then call tracescope_publish_crash_analysis to write the conclusion back to the sidebar.',
  },
  AGENT_CRASH_PUBLISHED: {
    zh: '已将崩溃分析结论写回 TraceScope 面板（任务 {id}）',
    en: 'Published crash conclusion to the TraceScope panel (job {id})',
  },
  TOOL_CRASH_PUBLISHED: {
    zh: '崩溃分析结论已写回侧栏',
    en: 'Crash analysis written back to the sidebar',
  },
  AGENT_HANDTEST_PERSISTED: {
    zh: '并已持久化到本机，重启后同一仓库与两版本会自动恢复（再次「AI 智能分析」并 publish 才会覆盖）。',
    en: 'Persisted locally; the same repo/version pair restores after restart (re-run AI analysis + publish to overwrite).',
  },
  AGENT_DIRECT_RIPPLE: {
    zh: '直接 {direct} · 波及 {ripple}',
    en: 'Direct {direct} · Ripple {ripple}',
  },
  AGENT_DIRECT_SECTION: { zh: '## 直接项', en: '## Direct' },
  AGENT_RIPPLE_SECTION: { zh: '## 可能波及', en: '## Possible ripple' },
  AGENT_VISUAL_CREATED: {
    zh: '已创建 UI 走查任务 {id}',
    en: 'Created UI review job {id}',
  },
  AGENT_VISUAL_NEXT: {
    zh: '请按提示词对照设计与代码，需要节点结构时调用 tracescope_get_design_snapshot。',
    en: 'Compare design vs code per the prompt; call tracescope_get_design_snapshot when you need node structure.',
  },
  AGENT_VISUAL_PUBLISH: {
    zh: '完成后调用 tracescope_publish_visual_findings 写回。',
    en: 'When done, call tracescope_publish_visual_findings to write back.',
  },
  AGENT_VISUAL_PUBLISHED: {
    zh: '已把 UI 走查结论写回 TraceScope 面板（任务 {id}），并持久化到本机，重开后同一页面自动恢复。',
    en: 'Wrote UI review findings back to TraceScope (job {id}) and persisted locally; the same page restores on reopen.',
  },
  AGENT_FINDINGS_COUNT: { zh: '共 {n} 条：', en: '{n} findings:' },
  AGENT_RENDER_PATCH_NOTE: {
    zh: '（另收到 {n} 组实验性 renderPatch，侧栏以差异清单为准，不再做代码还原预览。）',
    en: '({n} experimental renderPatch groups ignored for preview; sidebar uses the findings list.)',
  },
  AGENT_REMATCH_CREATED: {
    zh: '已创建文件匹配任务 {id}（候选 {n}）',
    en: 'Created page rematch job {id} ({n} candidates)',
  },
  AGENT_REMATCH_NEXT: {
    zh: '完成后调用 tracescope_publish_page_rematch 写回推荐文件。',
    en: 'When done, call tracescope_publish_page_rematch to write back recommendations.',
  },
  AGENT_REMATCH_PUBLISHED: {
    zh: '已写回 {n} 个推荐并持久化；侧栏将选中 {path}，重启后仍可恢复',
    en: 'Wrote back {n} recommendations and persisted; sidebar selects {path} (survives restart)',
  },
  AGENT_SNAPSHOT_TITLE: { zh: '设计快照 · {name}', en: 'Design snapshot · {name}' },
  AGENT_SNAPSHOT_ROOT: { zh: '根节点：{id} {name}', en: 'Root: {id} {name}' },
  AGENT_SNAPSHOT_MAX: {
    zh: '最多 {n} 个节点（结构化文本，非 Figma API）',
    en: 'Up to {n} nodes (structured text, not Figma API)',
  },
  AGENT_ANALYZE_SUMMARY: {
    zh: '直接项 {direct} · 可能波及 {ripple}',
    en: 'Direct {direct} · Possible ripple {ripple}',
  },
  AGENT_ANALYZE_RULE: {
    zh: '（规则分析；对话结论请用 tracescope_publish_handtest 回写面板）',
    en: '(Rule analysis; write conversational conclusions back with tracescope_publish_handtest)',
  },
  TOOL_HANDTEST_CREATED: { zh: '已创建手测任务', en: 'Hand-test job created' },
  TOOL_HANDTEST_PUBLISHED: { zh: '已发布验证清单', en: 'Checklist published' },
  TOOL_VISUAL_CREATED: { zh: '已创建 UI 走查任务', en: 'UI review job created' },
  TOOL_VISUAL_PUBLISHED: { zh: '已写回 UI 走查结论', en: 'UI review findings written back' },
  TOOL_REMATCH_CREATED: { zh: '已创建文件匹配任务', en: 'Page rematch job created' },
  TOOL_REMATCH_PUBLISHED: { zh: '已写回文件匹配推荐', en: 'Page rematch recommendations written back' },
  TOOL_SNAPSHOT: { zh: '设计快照', en: 'Design snapshot' },
  TOOL_COMMITS: {
    zh: '提交 {commits} · 引用 {refs}',
    en: 'Commits {commits} · Refs {refs}',
  },
  TOOL_DIFF_NONE: { zh: '无', en: 'none' },
  TOOL_DIFF_HEADER: {
    zh: '变更文件 {total} · 本批 offset={offset} · next={next}',
    en: 'Changed files {total} · batch offset={offset} · next={next}',
  },
  CLI_OPEN: {
    zh: '打开方式：会话页右上角展开右侧栏 → 引导页点「TraceScope」。',
    en: 'Open: expand the right sidebar on the session page → tap “TraceScope” on the guide.',
  },
  CLI_CMD: {
    zh: '命令行：/tracescope <repo> <baseCommit> <headCommit> [exportDir]',
    en: 'CLI: /tracescope <repo> <baseCommit> <headCommit> [exportDir]',
  },
  CLI_AI: {
    zh: 'AI 分析：面板点「AI 智能分析」→ 在会话里互动 → Agent 调用 tracescope_publish_handtest 后清单自动刷新。',
    en: 'AI analysis: panel “AI analysis” → chat → Agent calls tracescope_publish_handtest to refresh the checklist.',
  },
  CLI_DESC: {
    zh: '打开右侧 TraceScope 面板，或命令行按规则生成验证范围报告',
    en: 'Open the TraceScope sidebar, or generate a verification-scope report from the CLI',
  },
  SELF_UPDATE_HINT: {
    zh: '桌面端：扩展坞（Extension Dock）或「插件」页中更新本包，然后重启 Harness。',
    en: 'Desktop: update this package from Extension Dock or Plugins, then restart Harness.',
  },
}

type Params = Record<string, string | number>

export function ui(code: string, lang: Lang, params?: Params): string {
  const entry = UI_MESSAGES[code]
  if (!entry) return code
  let s = entry[lang] ?? entry.zh
  if (params) {
    s = s.replace(/\{(\w+)\}/g, (_, key: string) => {
      const value = params[key]
      return value === undefined || value === null ? `{${key}}` : String(value)
    })
  }
  return s
}

/** Resolve lang from a request body (defaults zh). */
export function langFromArgs(args: Record<string, unknown> | undefined, fallback: Lang = 'zh'): Lang {
  if (!args) return fallback
  return langFromBody(args, fallback)
}

/** Pick zh/en line without a message code (for one-off templates). */
export function pickLang(lang: Lang, zh: string, en: string): string {
  return lang === 'en' ? en : zh
}
