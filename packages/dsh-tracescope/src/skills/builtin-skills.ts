/**
 * Built-in TraceScope skills registered into DeepSeek Harness Desktop when the
 * host mounts `@deepseek-ai/dsh-skill`. Soft-fails when the skills service is
 * absent so the plugin still loads on hosts without the skill subsystem.
 *
 * Starter prompts in the composer are short task briefs that name these skills;
 * the full procedure lives here so tokens are not burned on every click.
 */
import type { Context } from '../dsh-shims.js'

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

const IMPACT_ANALYSIS_SKILL: SkillRegistrationLike = {
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
- \`tracescope_list_commits\` / \`tracescope_get_diff\` / \`tracescope_analyze_impact\`
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

const UI_REVIEW_SKILL: SkillRegistrationLike = {
  name: 'tracescope-ui-review',
  description:
    'TraceScope UI 走查：对照设计渲染图 / 静态差异与代码，找出还原偏差并用 tracescope_publish_visual_findings 写回。',
  whenToUse:
    '用户在 TraceScope 面板点击「AI 协助分析」、或要求对照设计稿做 UI 走查时。Starter 提示词会点名本 skill。',
  source: 'bundled',
  content: `# TraceScope UI 走查

## 目标
对照设计与真实代码找出还原偏差，给出可落地方案，写回侧栏。

## 硬性约束
- **不要**访问 figma.com，**不要**调用 Figma REST API。
- **不要**要求用户把整棵设计树贴进对话；侧栏可视化你看不到，请用任务单里的渲染图 / 静态差异，必要时再调工具。
- **必须**调用 \`tracescope_publish_visual_findings\` 写回。可多次写回。
- 忽略合理的动态宽高与设备差异；静态差异仅作线索，允许推翻。

## 设计稿如何获取（按优先级）
1. 任务单中的 **设计渲染图 URL**（多模态直接看图）。
2. 任务单中的 **静态差异摘要**。
3. 需要节点结构 / 文案 / 尺寸时：调用 \`tracescope_get_design_snapshot\`（传任务单 jobId；可带 nodeId 缩小范围）。
4. 代码：按任务单依赖清单阅读真实源码，不要臆造未列出的文件。

## 工具
- \`tracescope_get_design_snapshot\`：按需设计树快照
- \`tracescope_publish_visual_findings\`：写回结论

## 步骤
1. 加载本 skill 后，按清单读代码。
2. 对照渲染图 / 静态差异（必要时再拉设计快照），只列真问题。
3. 每条给出期望 vs 实际、文件与改法；动态区域标明不确定性。
4. 写回：
   - \`jobId\`：任务单 ID
   - \`findings\`：\`[{title,severity,nodeId?,location?,expected?,actual?,codeSource?,suggestion?}]\`
   - \`summary\`：可选
5. 中文简述；用户纠正后再次写回。
`,
}

const PAGE_MATCH_SKILL: SkillRegistrationLike = {
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

## 步骤
1. 必要时打开候选或搜索路由 / 页面名 / 文案，不要只凭文件名臆断。
2. Top 1～5（置信度降序），每条含 \`relativePath\`、\`adapterId\`、\`confidence\`(0..1)、中文 \`reason\`。
3. 写回：
   - \`jobId\`：任务单 ID
   - \`picks\`：\`[{adapterId,relativePath,kindLabel?,score?,reason?}]\`
   - \`note\`：可选
4. 说明 Top1；用户补充后再次写回。
`,
}

/** Register plugin-bundled skills when the host skill registry is available. */
export function registerBuiltinSkills(ctx: Context): void {
  const skills = resolveSkillsService(ctx)
  if (!skills) return
  for (const skill of [IMPACT_ANALYSIS_SKILL, UI_REVIEW_SKILL, PAGE_MATCH_SKILL]) {
    try {
      skills.register(skill)
    } catch {
      /* duplicate name or host rejection: ignore so plugin apply continues */
    }
  }
}
