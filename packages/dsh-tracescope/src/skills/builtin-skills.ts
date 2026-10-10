/**
 * Built-in TraceScope skills registered into DeepSeek Harness Desktop when the
 * host mounts `@deepseek-ai/dsh-skill`. Soft-fails when the skills service is
 * absent so the plugin still loads on hosts without the skill subsystem.
 *
 * Starter prompts in the composer are short task briefs that name these skills;
 * the full procedure lives here so tokens are not burned on every click.
 *
 * Language follows Host locale preference (settings.yaml / DSH_LOCALE / LANG),
 * defaulting to Chinese — same rule as the sidebar UI.
 */
import type { Context } from '../dsh-shims.js'
import { resolveHostLang, type Lang } from '../i18n/lang.js'

interface SkillRegistrationLike {
  name: string
  description: string
  whenToUse?: string
  content: string
  source?: string
}

interface SkillsServiceLike {
  register: (skill: SkillRegistrationLike) => unknown
}

function resolveSkillsService(ctx: Context): SkillsServiceLike | null {
  const fromGet = ctx.get?.('skills') as SkillsServiceLike | undefined
  if (fromGet && typeof fromGet.register === 'function') return fromGet
  const direct = (ctx as Context & { skills?: SkillsServiceLike }).skills
  if (direct && typeof direct.register === 'function') return direct
  return null
}

/** Best-effort Host language (defaults zh). */
export function resolveSkillsLang(ctx: Context): Lang {
  return resolveHostLang(ctx)
}

const IMPACT_ZH: SkillRegistrationLike = {
  name: 'tracescope-impact-analysis',
  description:
    'TraceScope 功能影响分析：根据两版本 diff 推导手测范围与风险点，并用 tracescope_publish_handtest 写回侧栏清单。',
  whenToUse:
    '用户在 TraceScope「功能影响分析」面板点击「AI 智能分析」、或要求根据 commit/diff 做影响分析与手测清单时。Starter 提示词会点名本 skill。',
  source: 'bundled',
  content: `# TraceScope 功能影响分析

## 目标
根据 base/head 真实 diff（及可选云效工作项）推导手测用例与风险点，区分直接 / 波及影响，写回侧栏。

## 硬性约束
- 必须用 TraceScope 工具拿真实 diff，禁止臆造变更。
- 必须调用 \`tracescope_publish_handtest\` 写回（否则侧栏不刷新）。可多次写回。
- 用中文；结论要可执行。

## 工具
- \`tracescope_create_handtest_job\`（无侧栏任务单时先创建） / \`tracescope_list_commits\` / \`tracescope_get_diff\` / \`tracescope_analyze_impact\`
- Codeup 模式：优先 tracescope / Codeup，不要假设本机有 git
- \`tracescope_publish_handtest\`：写回清单

## 步骤
1. 按任务单中的仓库、base、head（及关联工作项）拉真实 diff。
2. 推导手测用例与风险点；区分 \`direct\` 与 \`ripple\`。
3. 写回：
   - \`jobId\`：任务单中的 ID
   - \`items\`：\`[{displayName,kind(direct|ripple),risk(high|medium|low),files,suggestedSteps,evidence}]\`
4. 会话里中文简述；用户纠正后再次写回。
`,
}

const IMPACT_EN: SkillRegistrationLike = {
  name: 'tracescope-impact-analysis',
  description:
    'TraceScope impact analysis: derive hand-test scope and risks from a two-version diff, then publish the checklist via tracescope_publish_handtest.',
  whenToUse:
    'When the user clicks “AI analysis” in TraceScope Impact Analysis, or asks for impact analysis / a hand-test checklist from commits/diff. Starter prompts name this skill.',
  source: 'bundled',
  content: `# TraceScope impact analysis

## Goal
From the real base/head diff (and optional Yunxiao work items), derive hand-test cases and risks, separate direct vs ripple impact, and publish back to the sidebar.

## Hard rules
- Use TraceScope tools for the real diff; do not invent changes.
- Must call \`tracescope_publish_handtest\` to publish (sidebar will not refresh otherwise). May publish multiple times.
- Reply in English; keep conclusions actionable.

## Tools
- \`tracescope_create_handtest_job\` (create first if no sidebar job) / \`tracescope_list_commits\` / \`tracescope_get_diff\` / \`tracescope_analyze_impact\`
- Codeup mode: prefer TraceScope / Codeup; do not assume local git
- \`tracescope_publish_handtest\`: publish checklist

## Steps
1. Pull the real diff for the job’s repo, base, head (and linked work items).
2. Derive hand-test cases and risks; mark \`direct\` vs \`ripple\`.
3. Publish:
   - \`jobId\`: ID from the job card
   - \`items\`: \`[{displayName,kind(direct|ripple),risk(high|medium|low),files,suggestedSteps,evidence}]\`
4. Brief English summary in chat; republish after user corrections.
`,
}

const UI_ZH: SkillRegistrationLike = {
  name: 'tracescope-ui-review',
  description:
    'TraceScope UI 走查：对照设计稿与前端代码，充实差异清单（期望 vs 实际、位置、改法），并用 tracescope_publish_visual_findings 写回侧栏。',
  whenToUse:
    '用户在 TraceScope 面板点击「AI 协助分析」、或要求对照设计稿做 UI 走查时。Starter 提示词会点名本 skill。',
  source: 'bundled',
  content: `# TraceScope UI 走查

## 目标
以设计稿为准对照前端实现，**产出可执行的差异清单**（不是像素级 UI 还原预览）。写回侧栏后与静态差异合并展示。

## 硬性约束
- **不要**访问 figma.com，**不要**调用 Figma REST API。
- **不要**要求用户把整棵设计树贴进对话；侧栏可视化你看不到，请用任务单里的渲染图 / 静态差异，必要时再调工具。
- **不要**在回复或工具参数里嵌入 data URL / base64 图片。
- **必须**调用 \`tracescope_publish_visual_findings\` 写回。可多次写回。
- 忽略合理的动态宽高与设备差异；静态差异仅作线索，允许推翻。
- 列表 / 分页等运行时区域：在 findings 里标明「运行时数据不确定」，给出设计稿期望文案/结构即可，**不必**做可视化填模板。

## 设计稿如何获取（按优先级）
1. 任务单中的 **设计渲染图 http(s) URL**（若有）。
2. TraceScope **侧栏对照板**上的设计图（已展示时不要再把图贴进对话）。
3. 任务单中的 **静态差异摘要**。
4. 需要节点结构 / 文案 / 尺寸时：调用 \`tracescope_get_design_snapshot\`（传任务单 jobId；可带 nodeId 缩小范围）。
5. 代码：按任务单依赖清单阅读真实源码，不要臆造未列出的文件。

## 工具
- \`tracescope_start_visual_review\`（无侧栏任务单时先创建）
- \`tracescope_get_design_snapshot\`：按需设计树快照
- \`tracescope_publish_visual_findings\`：写回差异结论

## 步骤
1. 加载本 skill 后，按清单读代码。
2. 对照渲染图 / 静态差异（必要时再拉设计快照），只列真问题。
3. 每条给出期望 vs 实际、涉及文件与改法。
4. 写回：
   - \`jobId\`：任务单 ID
   - \`findings\`：\`[{title,severity,nodeId?,location?,expected?,actual?,codeSource?,suggestion?}]\`
     - **\`nodeId\` 必须来自** \`tracescope_get_design_snapshot\` 或静态差异摘要里的真实 id（如 \`12:345\`）；不知道就留空，用 \`location\` + 期望文案定位，**禁止臆造 id**
   - \`summary\`：可选
5. 中文简述；用户纠正后再次写回。
`,
}

const UI_EN: SkillRegistrationLike = {
  name: 'tracescope-ui-review',
  description:
    'TraceScope UI review: compare design vs frontend code, enrich the findings list (expected vs actual, location, fix), and publish via tracescope_publish_visual_findings.',
  whenToUse:
    'When the user clicks “AI assist” in TraceScope, or asks for a design-vs-code UI review. Starter prompts name this skill.',
  source: 'bundled',
  content: `# TraceScope UI review

## Goal
Treat the design as source of truth and produce an **actionable findings list** (not a pixel-perfect UI rebuild). After publish, findings merge with static diffs in the sidebar.

## Hard rules
- **Do not** visit figma.com or call the Figma REST API.
- **Do not** ask the user to paste the whole design tree; you cannot see the sidebar canvas — use the job’s render URL / static diffs, then tools if needed.
- **Do not** embed data URL / base64 images in replies or tool args.
- **Must** call \`tracescope_publish_visual_findings\`. May publish multiple times.
- Ignore reasonable dynamic sizing / device differences; static diffs are clues only.
- For list/pagination runtime areas: mark “runtime data uncertain” in findings and state the design’s expected copy/structure — **no** visual template fill.

## How to get design context (priority)
1. Design render http(s) URL on the job card (if any).
2. Design image already on the TraceScope compare board (do not re-paste).
3. Static diff summary on the job card.
4. For node structure / copy / sizes: \`tracescope_get_design_snapshot\` (jobId; optional nodeId).
5. Code: read real sources from the job’s dependency list; do not invent files.

## Tools
- \`tracescope_start_visual_review\` (create first if no sidebar job)
- \`tracescope_get_design_snapshot\`: design tree snapshot on demand
- \`tracescope_publish_visual_findings\`: publish findings

## Steps
1. After loading this skill, read code from the list.
2. Compare render / static diffs (snapshot if needed); list only real issues.
3. For each item: expected vs actual, files, and how to fix.
4. Publish:
   - \`jobId\`
   - \`findings\`: \`[{title,severity,nodeId?,location?,expected?,actual?,codeSource?,suggestion?}]\`
     - **\`nodeId\` must come from** \`tracescope_get_design_snapshot\` or a real id in the static summary (e.g. \`12:345\`); leave empty if unknown — use \`location\` + expected copy; **never invent ids**
   - \`summary\` optional
5. Brief English summary; republish after corrections.
`,
}

const PAGE_ZH: SkillRegistrationLike = {
  name: 'tracescope-page-match',
  description:
    'TraceScope 设计页 ↔ 代码文件匹配：推荐最可能实现该页的仓库文件，并用 tracescope_publish_page_rematch 写回。',
  whenToUse:
    '用户在映射卡片点击「AI 推荐文件」、或要求重新匹配设计页对应源码时。Starter 提示词会点名本 skill。',
  source: 'bundled',
  content: `# TraceScope 页面文件匹配

## 目标
根据设计页名、文案样本与静态候选，推荐最可能实现该页的仓库文件，写回侧栏选中项。

## 硬性约束
- **不要**访问 figma.com，**不要**调用 Figma REST API。
- **必须**调用 \`tracescope_publish_page_rematch\` 写回。可多次写回。
- 静态候选仅作线索；可推荐列表外更佳路径。
- 无侧栏任务单时先调用 \`tracescope_start_page_rematch\` 获取 jobId 与候选提示词。

## 步骤
1. 必要时打开候选或搜索路由 / 页面名 / 文案，不要只凭文件名臆断。
2. Top 1～3（置信度降序），每条含 \`relativePath\`、\`adapterId\`、\`confidence\`(0..1)、中文 \`reason\`。
3. 写回：
   - \`jobId\`：任务单 ID
   - \`picks\`：\`[{adapterId,relativePath,kindLabel?,score?,reason?}]\`
   - \`note\`：可选
4. 说明 Top1；用户补充后再次写回。
`,
}

const PAGE_EN: SkillRegistrationLike = {
  name: 'tracescope-page-match',
  description:
    'TraceScope design-page ↔ code-file match: recommend the most likely repo files for a page and publish via tracescope_publish_page_rematch.',
  whenToUse:
    'When the user clicks “AI recommend file” on a mapping card, or asks to rematch a design page to source. Starter prompts name this skill.',
  source: 'bundled',
  content: `# TraceScope page file match

## Goal
From page name, copy samples, and static candidates, recommend the most likely repo files and publish the sidebar selection.

## Hard rules
- **Do not** visit figma.com or call the Figma REST API.
- **Must** call \`tracescope_publish_page_rematch\`. May publish multiple times.
- Static candidates are clues only; you may recommend better paths outside the list.
- If there is no sidebar job, call \`tracescope_start_page_rematch\` first for jobId and candidate prompt.

## Steps
1. Open candidates or search routes / page names / copy when needed; do not guess from filenames alone.
2. Top 1–3 (confidence descending), each with \`relativePath\`, \`adapterId\`, \`confidence\` (0..1), English \`reason\`.
3. Publish:
   - \`jobId\`
   - \`picks\`: \`[{adapterId,relativePath,kindLabel?,score?,reason?}]\`
   - \`note\` optional
4. Explain Top1; republish after user input.
`,
}

const CRASH_ZH: SkillRegistrationLike = {
  name: 'tracescope-crash-analysis',
  description:
    'TraceScope 崩溃分析：根据堆栈与命中文件定位根因与修复建议，并用 tracescope_publish_crash_analysis 写回侧栏。',
  whenToUse:
    '用户在 TraceScope「崩溃分析」面板点击「分析并写入会话」、或要求根据崩溃/ANR 堆栈做根因分析时。Starter 提示词会点名本 skill。',
  source: 'bundled',
  content: `# TraceScope 崩溃分析

## 目标
根据侧栏给出的堆栈、命中文件与排查建议，定位根因、影响范围与最小修复，写回侧栏「AI 分析结论」。

## 硬性约束
- 必须以任务单中的堆栈与命中文件为准，禁止臆造不存在的符号/路径。
- **必须**调用 \`tracescope_publish_crash_analysis\` 写回（否则侧栏不会自动刷新）。可多次写回。
- 用中文；结论要可执行。

## 工具
- \`tracescope_publish_crash_analysis\`：写回结论（\`jobId\` + \`analysis\`）

## 步骤
1. 阅读任务单中的摘要、命中文件、完整堆栈。
2. 给出：根因、影响范围、修复建议（可含关键代码路径）。
3. 写回：
   - \`jobId\`：任务单中的 ID
   - \`analysis\`：完整结论文本（markdown 可）
4. 会话里中文简述；用户纠正后再次写回。
`,
}

const CRASH_EN: SkillRegistrationLike = {
  name: 'tracescope-crash-analysis',
  description:
    'TraceScope crash analysis: locate root cause and fixes from a stack + matched files, then publish via tracescope_publish_crash_analysis.',
  whenToUse:
    'When the user clicks “Analyze & write to session” in TraceScope Crash analysis, or asks for crash/ANR root-cause analysis from a stack. Starter prompts name this skill.',
  source: 'bundled',
  content: `# TraceScope crash analysis

## Goal
From the stack, matched files, and hints in the job card, produce root cause, impact, and a minimal fix; publish back to the sidebar AI conclusion.

## Hard rules
- Ground conclusions in the provided stack and matched files; do not invent symbols/paths.
- **Must** call \`tracescope_publish_crash_analysis\` (sidebar will not auto-refresh otherwise). May publish multiple times.
- Reply in English; keep conclusions actionable.

## Tools
- \`tracescope_publish_crash_analysis\`: publish (\`jobId\` + \`analysis\`)

## Steps
1. Read the job summary, matched files, and full stack.
2. Produce: root cause, impact, fix suggestions (with file paths when known).
3. Publish:
   - \`jobId\` from the job card
   - \`analysis\`: full conclusion text (markdown ok)
4. Brief chat summary; republish after user corrections.
`,
}

/** Register plugin-bundled skills when the host skill registry is available. */
export function registerBuiltinSkills(ctx: Context): void {
  const skills = resolveSkillsService(ctx)
  if (!skills) return
  const lang = resolveSkillsLang(ctx)
  const pack =
    lang === 'en'
      ? [IMPACT_EN, UI_EN, PAGE_EN, CRASH_EN]
      : [IMPACT_ZH, UI_ZH, PAGE_ZH, CRASH_ZH]
  for (const skill of pack) {
    try {
      skills.register(skill)
    } catch {
      /* duplicate name or host rejection: ignore so plugin apply continues */
    }
  }
}
