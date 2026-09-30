/**
 * Generates packages/core/src/chat-prompt.ts with proper UTF-8 Chinese.
 * Run: node scripts/gen-chat-prompt.mjs
 */
import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const out = resolve(__dirname, '../src/chat-prompt.ts')

const S = {
  relatedTitle: '\u5173\u8054\u7684\u654f\u6377\u5de5\u4f5c\u9879\u5171',
  relatedHint: '\u6761\uff08\u4f9b\u5bf9\u7167\u9700\u6c42/\u7f3a\u9677\uff09\uff1a',
  relatedFooter:
    '\u8bf7\u7ed3\u5408\u5de5\u4f5c\u9879\u7406\u89e3\u6539\u52a8\u610f\u56fe\uff0c\u518d\u5bf9\u7167 diff \u7ed9\u51fa\u9a8c\u8bc1\u5efa\u8bae\u3002',
  taskHead: '\u8fd9\u662f TraceScope \u5f71\u54cd\u9762\u5206\u6790\u4efb\u52a1\uff08\u4efb\u52a1 ID: ',
  taskTail: '\uff09\u3002',
  repo: '\u4ed3\u5e93\uff1a',
  base: '\u5bf9\u6bd4\u57fa\u7ebf\uff08base\uff09\uff1a',
  head: '\u5bf9\u6bd4\u76ee\u6807\uff08head\uff09\uff1a',
  steps: '\u8bf7\u6309\u4e0b\u5217\u6b65\u9aa4\u5b8c\u6210\uff1a',
  codeupHint:
    '\u53ef\u4f18\u5148\u7528 Codeup API / tracescope \u5de5\u5177\u53d6\u63d0\u4ea4\u4e0e diff\uff1b\u5fc5\u8981\u65f6\u518d\u56de\u9000\u5230\u672c\u5730 git\u3002',
  gitHint:
    '\u4f18\u5148\u7528 tracescope \u7684 git \u5de5\u5177\u8bfb\u53d6\u63d0\u4ea4\u4e0e bare \u4ed3\u5e93 diff\u3002',
  step1:
    '1. \u7528 tracescope_list_commits / tracescope_get_diff / tracescope_analyze_impact \u5f04\u6e05\u53d8\u66f4\u8303\u56f4\u4e0e\u5173\u952e diff\uff0c\u4e0d\u8981\u81ba\u9020\u6587\u4ef6\u3002',
  step2:
    '2. \u533a\u5206\u76f4\u63a5\u6539\u52a8 / \u6ce2\u53ca\u5f71\u54cd\uff0c\u5e76\u7ed9\u51fa\u53ef\u6267\u884c\u7684\u624b\u6d4b\u5efa\u8bae\u3002',
  step3: '3. \u98ce\u9669\u4e0e\u6b65\u9aa4\u8981\u5177\u4f53\u3001\u53ef\u9a8c\u8bc1\u3002',
  step4:
    '4. \u5b8c\u6210\u540e\u8c03\u7528 tracescope_publish_handtest\uff0c\u628a\u6e05\u5355\u5199\u56de TraceScope \u4fa7\u680f\uff1a',
  jobMust: '   - jobId \u5fc5\u987b\u662f\uff1a',
  itemsHint:
    '   - items \u4e3a JSON \u6570\u7ec4\uff0c\u542b displayName\u3001kind(direct|ripple)\u3001risk(high|medium|low)\u3001files\u3001suggestedSteps\u3001evidence\u3002',
  publishOk:
    '\u5199\u56de\u6210\u529f\u540e\uff0cTraceScope \u4fa7\u680f\u4f1a\u5237\u65b0\u9a8c\u8bc1\u6e05\u5355\u3002',
  empty: '\uff08\u7a7a\uff09',
  unresolved: '\u672a\u89e3\u6790:',
  high: '\u9ad8',
  mid: '\u4e2d',
  low: '\u4f4e',
  visualIntro:
    '\u8bf7\u534f\u52a9\u5206\u6790\u8fd9\u4e00\u9875\u7684 UI \u8d70\u67e5\u5dee\u5f02\uff0c\u5e76\u7ed9\u51fa\u53ef\u843d\u5730\u7684\u4fee\u6539\u5efa\u8bae\u3002',
  designPage: '\u8bbe\u8ba1\u9875\uff1a',
  codeLabel: '\u4ee3\u7801\uff1a',
  viewport: '\u89c6\u53e3\uff1a',
  diffCountPrefix: '\u5f53\u524d\u5dee\u5f02\u5171 ',
  diffCountSuffix: ' \u6761\uff1a',
  noDiff: '\uff08\u6682\u65e0\u5dee\u5f02\u6761\u76ee\uff09',
  replyReq: '\u8bf7\u6309\u4e0b\u9762\u8981\u6c42\u56de\u590d\uff1a',
  v1: '1. \u5148\u5224\u65ad\u54ea\u4e9b\u662f\u771f\u95ee\u9898\u3001\u54ea\u4e9b\u53ef\u80fd\u662f\u52a8\u6001\u5e03\u5c40/\u8bbe\u5907\u5dee\u5f02\u5bfc\u81f4\u7684\u8bef\u62a5\u3002',
  v2: '2. \u5bf9\u771f\u95ee\u9898\u7ed9\u51fa\u4f18\u5148\u7ea7\u4e0e\u5177\u4f53\u6539\u6cd5\uff08\u6587\u4ef6 / \u5c5e\u6027 / \u671f\u671b\u503c\uff09\u3002',
  v3: '3. \u82e5\u4fe1\u606f\u4e0d\u8db3\uff0c\u5148\u63d0\u51fa\u9700\u8981\u6211\u8865\u5145\u7684\u7ebf\u7d22\uff0c\u6211\u4eec\u53ef\u5728\u672c\u4f1a\u8bdd\u7ee7\u7eed\u5bf9\u9f50\u3002',
  designExpect: '\u8bbe\u8ba1',
  codeExpect: '\u4ee3\u7801',
  codeVisualIntro:
    '\u8bf7\u534f\u52a9\u505a UI \u8d70\u67e5\uff1a\u5bf9\u7167\u8bbe\u8ba1\u7a3f\u4e0e\u771f\u5b9e\u4ee3\u7801\u5b9e\u73b0\uff0c\u627e\u51fa\u8fd8\u539f\u504f\u5dee\u5e76\u7ed9\u51fa\u53ef\u843d\u5730\u7684\u6539\u6cd5\u3002',
  noFigma:
    '\u4e0d\u8981\u8bbf\u95ee figma.com\uff0c\u4e5f\u4e0d\u8981\u8c03\u7528 Figma REST API\uff1b\u8bbe\u8ba1\u4fe1\u606f\u5df2\u7531 TraceScope \u63d0\u4f9b\u3002',
  jobIdLine: '\u672c\u9875 UI \u8d70\u67e5\u4efb\u52a1 ID\uff1a',
  designBlockTitle:
    '\u3010\u8bbe\u8ba1\u7a3f\u4fe1\u606f \u2014 \u5df2\u7531 TraceScope \u672c\u5730\u62c9\u53d6\uff0c\u8bf7\u76f4\u63a5\u4f7f\u7528\u3011',
  designName: '\u8bbe\u8ba1\u9875\u540d\u79f0\uff1a',
  designUrl:
    '\u8bbe\u8ba1\u7a3f\u94fe\u63a5\uff08\u4ec5\u4f9b\u5f15\u7528\uff0c\u4e0d\u8981\u53bb fetch / \u8c03\u7528 Figma API\uff09\uff1a',
  designImg:
    '\u8bbe\u8ba1\u7a3f\u6e32\u67d3\u56fe URL\uff08\u82e5\u5ba2\u6237\u7aef\u652f\u6301\u591a\u6a21\u6001\u53ef\u67e5\u770b\uff09\uff1a',
  designSnap:
    '\u8bbe\u8ba1\u6811\u5feb\u7167\uff08\u672c\u5730\uff0c\u65e0\u9700\u518d\u8bf7\u6c42 Figma API\uff09\uff1a',
  noSnap:
    '\uff08\u6682\u65e0\u8bbe\u8ba1\u6811\u5feb\u7167/\u6e32\u67d3\u56fe\uff1b\u8bf7\u7ed3\u5408\u9875\u9762\u540d\u79f0\u4e0e\u4ee3\u7801\u7ed3\u6784\u63a8\u65ad\uff0c\u5e76\u5728\u56de\u590d\u4e2d\u6807\u660e\u4e0d\u786e\u5b9a\u70b9\u3002\uff09',
  staticDiffs:
    '\u63d2\u4ef6\u9759\u6001\u6bd4\u5bf9\u5df2\u53d1\u73b0\u7684\u5dee\u5f02\uff08\u53ef\u4f5c\u7ebf\u7d22\uff0c\u5141\u8bb8\u63a8\u7ffb\uff09\uff1a',
  repoPath: '\u4ed3\u5e93\u8def\u5f84\uff1a',
  stack: '\u6280\u672f\u6808\uff1a',
  entry: '\u5165\u53e3\u6587\u4ef6\uff1a',
  gitCtx: 'Git \u4e0a\u4e0b\u6587\uff1a',
  androidManifest:
    '\u4e0b\u5217\u662f Android XML \u5e03\u5c40\u4f9d\u8d56\u95ed\u5305\uff08\u542b <include>\u3001\u4ee5\u53ca @drawable/@color/@dimen/@string/@style \u4e0e style parent\uff09\u3002\u8bf7\u6309\u6e05\u5355\u9605\u8bfb\u771f\u5b9e\u6e90\u7801\uff0c\u4e0d\u8981\u81ba\u9020\u672a\u5217\u51fa\u7684\u6587\u4ef6\u3002',
  sourceManifest:
    '\u4e0b\u5217\u662f\u5165\u53e3\u6e90\u6587\u4ef6\u53ca\u540c\u76ee\u5f55 / \u8fd1\u90bb sibling\u3002\u8bf7\u6309\u6e05\u5355\u9605\u8bfb\u771f\u5b9e\u6e90\u7801\uff0c\u5fc5\u8981\u65f6\u518d\u6cbf import / \u7ec4\u4ef6\u5f15\u7528\u7ee7\u7eed\u6253\u5f00\u76f8\u5173\u6587\u4ef6\u3002',
  cvStep1Xml:
    '1. \u5728\u4ed3\u5e93 ${repo} \u4e2d\u6309\u6e05\u5355\u9605\u8bfb\u5e03\u5c40\u4e0e\u8d44\u6e90\uff0c\u91cd\u70b9\u6838\u5bf9 layout_width/height\u3001margin/padding\u3001\u989c\u8272\u3001\u5b57\u53f7\u3001\u6587\u6848\u4e0e\u53ef\u89c1\u63a7\u4ef6\u5c42\u7ea7\u3002',
  cvStep1Src:
    '1. \u5728\u4ed3\u5e93 ${repo} \u4e2d\u6309\u6e05\u5355\u9605\u8bfb\u5165\u53e3\u4e0e\u5173\u8054\u6e90\u7801\uff0c\u91cd\u70b9\u6838\u5bf9 UI \u7ed3\u6784\u3001\u6837\u5f0f\u3001\u6587\u6848\u4e0e\u53ef\u89c1\u63a7\u4ef6\u5c42\u7ea7\u3002',
  cvStep2:
    '2. \u5bf9\u7167\u8bbe\u8ba1\u5feb\u7167 / \u6e32\u67d3\u56fe\uff0c\u5217\u51fa\u771f\u95ee\u9898\uff08\u5ffd\u7565\u5408\u7406\u7684\u52a8\u6001\u5bbd\u9ad8\u4e0e\u8bbe\u5907\u5dee\u5f02\uff09\u3002',
  cvStep3:
    '3. \u6bcf\u6761\u95ee\u9898\u7ed9\u51fa\u671f\u671b vs \u5b9e\u9645\u3001\u6d89\u53ca\u6587\u4ef6\u4e0e\u4fee\u6539\u5efa\u8bae\u3002',
  cvStep4Xml:
    '4. \u5bf9 RecyclerView / ViewPager / WebView \u7b49\u9759\u6001\u96be\u4ee5\u786e\u5b9a\u7684\u533a\u57df\u5355\u72ec\u8bf4\u660e\uff0c\u5e76\u5728 findings \u91cc\u5199\u6e05 nodeId\uff08\u82e5\u53ef\u77e5\uff09\u4e0e\u4e0d\u786e\u5b9a\u6027\u3002',
  cvStep4Src:
    '4. \u5bf9 WebView\u3001\u5f02\u6b65\u5217\u8868/\u5206\u9875\u7b49\u9759\u6001\u96be\u4ee5\u786e\u5b9a\u7684\u533a\u57df\u5355\u72ec\u8bf4\u660e\uff0c\u5e76\u5728 findings \u91cc\u5199\u6e05 nodeId\uff08\u82e5\u53ef\u77e5\uff09\u4e0e\u4e0d\u786e\u5b9a\u6027\u3002',
  cvStep5:
    '5. \u53ef\u4e0e\u6211\u5728\u672c\u4f1a\u8bdd\u7ee7\u7eed\u8ffd\u95ee\u3001\u7ea0\u6b63\u8bef\u5224\uff1b\u4e0d\u8981\u4e00\u6b21\u8bf4\u6b7b\u540e\u65e0\u6cd5\u4fee\u6539\u3002',
  cvStep6Prefix:
    '6. \u5b8c\u6210\u540e\u8c03\u7528 tracescope_publish_visual_findings\uff0c\u4f20\u5165 jobId = ',
  cvStep6Suffix:
    '\uff0c\u628a findings \u5199\u56de TraceScope \u4fa7\u680f\uff08\u542b title/severity/nodeId/expected/actual/suggestion\uff09\u3002\u5199\u56de\u6210\u529f\u540e\u4fa7\u680f\u4f1a\u5237\u65b0\u3002',
  rematchIntro:
    '\u8bf7\u534f\u52a9\u300c\u8bbe\u8ba1\u7a3f \u2194 \u4ee3\u7801\u6587\u4ef6\u300d\u5339\u914d\uff1a\u6839\u636e\u8bbe\u8ba1\u9875\u4fe1\u606f\uff0c\u63a8\u8350\u6700\u53ef\u80fd\u5b9e\u73b0\u8be5\u9875\u9762\u7684\u4ed3\u5e93\u6587\u4ef6\u3002',
  rematchNoFigma:
    '\u4e0d\u8981\u8bbf\u95ee figma.com\uff0c\u4e5f\u4e0d\u8981\u8c03\u7528 Figma REST API\u3002',
  nodeId: '\u8bbe\u8ba1\u9875 node-id\uff1a',
  designLinkOnly: '\u8bbe\u8ba1\u7a3f\u94fe\u63a5\uff08\u4ec5\u4f9b\u5f15\u7528\uff09\uff1a',
  currentSelPrefix: '\u5f53\u524d\u4fa7\u680f\u5df2\u9009\uff1a',
  currentSelSuffix:
    '\u3002\u82e5\u4f60\u8ba4\u4e3a\u9009\u9519\u4e86\uff0c\u8bf7\u660e\u786e\u6307\u51fa\u6b63\u786e\u6587\u4ef6\u3002',
  noSel: '\u5f53\u524d\u4fa7\u680f\u5c1a\u672a\u9009\u5b9a\u4ee3\u7801\u6587\u4ef6\u3002',
  sampleTexts: '\u8bbe\u8ba1\u6587\u6848\u6837\u672c\uff1a',
  noTexts:
    '\uff08\u8bbe\u8ba1\u7a3f\u51e0\u4e4e\u6ca1\u6709\u53ef\u8bfb\u6587\u6848\uff0c\u8bf7\u4e3b\u8981\u4f9d\u636e\u9875\u9762\u540d\u79f0\u4e0e\u5019\u9009\u6587\u4ef6\u8def\u5f84/\u7ed3\u6784\u5224\u65ad\uff09',
  candidatesTitle:
    '\u9759\u6001\u5339\u914d\u5019\u9009\uff08\u4ec5\u4f9b\u53c2\u8003\uff0c\u53ef\u4ee5\u5168\u90e8\u63a8\u7ffb\uff09\uff1a',
  noCandidates:
    '\uff08\u9759\u6001\u5339\u914d\u672a\u7ed9\u51fa\u5019\u9009\uff1b\u8bf7\u76f4\u63a5\u5728\u4ed3\u5e93\u4e2d\u641c\u7d22\u66f4\u5408\u9002\u7684\u9875\u9762\u6587\u4ef6\uff09',
  reason: '\uff1b\u7406\u7531\uff1a',
  codeSample: '\u4ee3\u7801\u6587\u6848\u62bd\u6837\uff1a',
  staticScore: '\u9759\u6001\u5206 ',
  rematchReq: '\u8bf7\u6309\u4e0b\u5217\u8981\u6c42\u56de\u590d\uff1a',
  r1: '1. \u5fc5\u8981\u65f6\u6253\u5f00\u5019\u9009\u6587\u4ef6\uff08\u6216\u641c\u7d22\u8def\u7531/\u9875\u9762\u540d/\u6587\u6848\uff09\u6838\u5bf9\uff0c\u4e0d\u8981\u53ea\u51ed\u6587\u4ef6\u540d\u81ba\u65ad\u3002',
  r2: '2. \u6309\u7f6e\u4fe1\u5ea6\u4ece\u9ad8\u5230\u4f4e\u5217\u51fa\u63a8\u8350\uff0c\u6bcf\u6761\u5305\u542b\uff1a',
  r2a: '   - relativePath\uff08\u4ed3\u5e93\u76f8\u5bf9\u8def\u5f84\uff09',
  r2b: '   - adapterId\uff08\u82e5\u53ef\u77e5\uff0c\u5982 android-xml / android-compose / uni-app \u7b49\uff09',
  r2c: '   - \u7b80\u77ed\u4e2d\u6587\u7406\u7531',
  r3: '3. \u82e5\u5019\u9009\u90fd\u4e0d\u5bf9\uff0c\u76f4\u63a5\u7ed9\u51fa\u4f60\u8ba4\u4e3a\u6b63\u786e\u7684\u8def\u5f84\uff0c\u5e76\u8bf4\u660e\u641c\u7d22\u4f9d\u636e\u3002',
  r4: '4. \u6211\u4f1a\u5728 TraceScope \u4fa7\u680f\u624b\u52a8\u9009\u62e9\u6587\u4ef6\uff1b\u82e5\u63a8\u8350\u6709\u8bef\uff0c\u6211\u4f1a\u5728\u672c\u4f1a\u8bdd\u7ee7\u7eed\u8865\u5145\u7ebf\u7d22\uff08\u9875\u9762\u7528\u9014\u3001\u5173\u952e\u8bcd\u3001\u6a21\u5757\u540d\u7b49\uff09\uff0c\u8bf7\u636e\u6b64\u4fee\u6b63\uff0c\u4e0d\u8981\u575a\u6301\u9519\u8bef\u7ed3\u8bba\u3002',
  r5: '5. \u56de\u590d\u4fdd\u6301\u53ef\u8ba8\u8bba\uff1a\u5148\u7ed9 Top 1\uff5e3\uff0c\u518d\u95ee\u6211\u662f\u5426\u9700\u8981\u6362\u65b9\u5411\uff0c\u800c\u4e0d\u662f\u4e00\u6b21\u6027\u65e0\u6cd5\u4fee\u6539\u7684\u6b7b\u7ed3\u8bba\u3002',
  noStaticDiff: '\uff08\u65e0\u9759\u6001\u5dee\u5f02\uff09',
}

const src = `import type { AgileWorkItemRef } from './agile-workitems.js'

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
          \`${S.relatedTitle} \${related.length} ${S.relatedHint}\`,
          ...related.map((item, idx) => {
            const cat = item.category ? \`[\${item.category}] \` : ''
            const desc = item.description
              ? \` \\u2014 \${item.description.replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' ').trim().slice(0, 160)}\`
              : ''
            return \`\${idx + 1}. \${cat}\${item.subject}\\uff08id: \${item.id}\\uff09\${desc}\`
          }),
          '${S.relatedFooter}',
        ]

  return [
    \`${S.taskHead}\${input.jobId}${S.taskTail}\`,
    '',
    \`${S.repo}\${input.repoPath}\`,
    \`${S.base}\${input.baseCommit}\`,
    \`${S.head}\${input.headCommit}\`,
    ...relatedBlock,
    '',
    '${S.steps}',
    input.accessMode === 'codeup'
      ? '${S.codeupHint}'
      : '${S.gitHint}',
    '${S.step1}',
    '${S.step2}',
    '${S.step3}',
    '${S.step4}',
    '${S.jobMust}' + input.jobId,
    '${S.itemsHint}',
    '',
    '${S.publishOk}',
  ].join('\\n')
}

/** One high-fidelity visual difference, as rendered in the compare board. */
export interface VisualChatDiff {
  nodeName: string
  property: string
  severity: 'high' | 'medium' | 'low'
  expected?: unknown
  actual?: unknown
}

export interface VisualChatPromptInput {
  designName: string
  codeRelativePath: string
  platformLabel?: string
  viewport?: { width: number; height: number }
  diffs: VisualChatDiff[]
}

const SEVERITY_RANK_LABEL: Record<'high' | 'medium' | 'low', string> = {
  high: '${S.high}',
  medium: '${S.mid}',
  low: '${S.low}',
}

function formatPromptValue(value: unknown): string {
  if (value === undefined || value === null) return '${S.empty}'
  if (typeof value === 'object') {
    const unresolved = value as { unresolved?: boolean; raw?: string }
    if (unresolved.unresolved) return \`${S.unresolved}\${unresolved.raw}\`
  }
  return String(value)
}

/**
 * Build the starter prompt for a single high-fidelity page's AI assist.
 */
export function buildVisualChatPrompt(input: VisualChatPromptInput): string {
  const lines = input.diffs.map((d, i) => {
    const sev = SEVERITY_RANK_LABEL[d.severity]
    return \`\${i + 1}. [\${sev}] \${d.nodeName} \\u00b7 \${d.property}\\uff1a${S.designExpect} \${formatPromptValue(
      d.expected,
    )} / ${S.codeExpect} \${formatPromptValue(d.actual)}\`
  })
  const vp = input.viewport
  const viewportLine = vp ? \`\\n${S.viewport}\${vp.width} \\u00d7 \${vp.height}\` : ''
  return [
    '${S.visualIntro}',
    '',
    \`${S.designPage}\${input.designName}\`,
    \`${S.codeLabel}\${input.platformLabel ?? 'Android XML'} \\u00b7 \${input.codeRelativePath}\`,
    viewportLine ? viewportLine.trim() : '',
    '',
    \`${S.diffCountPrefix}\${input.diffs.length}${S.diffCountSuffix}\`,
    lines.length ? lines.join('\\n') : '${S.noDiff}',
    '',
    '${S.replyReq}',
    '${S.v1}',
    '${S.v2}',
    '${S.v3}',
  ]
    .filter((l) => l !== '')
    .join('\\n')
}

export type CodeVisualManifestMode = 'android-xml' | 'source-files'

export interface CodeVisualPromptInput {
  designName: string
  figmaUrl: string
  designImageUrl?: string
  designSnapshot?: string
  staticDiffSummary?: string
  repoPath: string
  platformLabel?: string
  codeRelativePath: string
  dependencyManifest: string
  manifestMode?: CodeVisualManifestMode
  gitSummary?: string
  jobId?: string
}

export function buildCodeVisualPrompt(input: CodeVisualPromptInput): string {
  const mode: CodeVisualManifestMode = input.manifestMode ?? 'android-xml'

  const designBlock: string[] = [
    '',
    '${S.designBlockTitle}',
    \`${S.designName}\${input.designName}\`,
    \`${S.designUrl}\${input.figmaUrl}\`,
  ]
  if (input.designImageUrl) {
    designBlock.push(\`${S.designImg}\${input.designImageUrl}\`)
  }
  if (input.designSnapshot) {
    designBlock.push('${S.designSnap}')
    designBlock.push(input.designSnapshot)
  } else if (!input.designImageUrl) {
    designBlock.push('${S.noSnap}')
  }
  if (input.staticDiffSummary) {
    designBlock.push('')
    designBlock.push('${S.staticDiffs}')
    designBlock.push(input.staticDiffSummary)
  }

  const manifestIntro =
    mode === 'android-xml'
      ? '${S.androidManifest}'
      : '${S.sourceManifest}'

  const step1 =
    mode === 'android-xml'
      ? \`${S.cvStep1Xml.replace('${repo}', '\${input.repoPath}')}\`
      : \`${S.cvStep1Src.replace('${repo}', '\${input.repoPath}')}\`

  const step4 =
    mode === 'android-xml'
      ? '${S.cvStep4Xml}'
      : '${S.cvStep4Src}'

  return [
    '${S.codeVisualIntro}',
    '${S.noFigma}',
    '',
    input.jobId ? \`${S.jobIdLine}\${input.jobId}\` : '',
    ...designBlock,
    '',
    \`${S.repoPath}\${input.repoPath}\`,
    \`${S.stack}\${input.platformLabel ?? 'Android XML'}\`,
    \`${S.entry}\${input.codeRelativePath}\`,
    input.gitSummary ? \`${S.gitCtx}\\n\${input.gitSummary}\` : '',
    '',
    manifestIntro,
    input.dependencyManifest,
    '',
    '${S.steps}',
    step1,
    '${S.cvStep2}',
    '${S.cvStep3}',
    step4,
    '${S.cvStep5}',
    input.jobId
      ? \`${S.cvStep6Prefix}\${input.jobId}${S.cvStep6Suffix}\`
      : '',
  ]
    .filter((l) => l !== '')
    .join('\\n')
}

export interface PageRematchCandidate {
  adapterId: string
  kindLabel: string
  relativePath: string
  score: number
  reasons: string[]
  codeTexts?: string[]
}

export interface PageRematchPromptInput {
  designName: string
  designId: string
  figmaUrl: string
  repoPath: string
  sampleTexts: string[]
  candidates: PageRematchCandidate[]
  currentSelection?: { adapterId: string; relativePath: string }
}

/** Starter prompt for rematch: user reviews in composer and can keep chatting. */
export function buildPageRematchPrompt(input: PageRematchPromptInput): string {
  const texts =
    input.sampleTexts.length > 0
      ? input.sampleTexts.map((t, i) => \`\${i + 1}. \${t}\`).join('\\n')
      : '${S.noTexts}'

  const catalog =
    input.candidates.length > 0
      ? input.candidates
          .map((c, i) => {
            const reasons = c.reasons.length ? \`${S.reason}\${c.reasons.join('\\u3001')}\` : ''
            const codeTexts =
              c.codeTexts && c.codeTexts.length
                ? \`\\n   ${S.codeSample}\${c.codeTexts.slice(0, 8).join(' | ')}\`
                : ''
            return \`\${i + 1}. [\${c.kindLabel}] \${c.relativePath}\\uff08${S.staticScore}\${Math.round(c.score * 100)}%\uff0cadapter=\${c.adapterId}\\uff09\${reasons}\${codeTexts}\`
          })
          .join('\\n')
      : '${S.noCandidates}'

  const current = input.currentSelection
    ? \`${S.currentSelPrefix}\${input.currentSelection.relativePath}\\uff08adapter=\${input.currentSelection.adapterId}\\uff09${S.currentSelSuffix}\`
    : '${S.noSel}'

  return [
    '${S.rematchIntro}',
    '${S.rematchNoFigma}',
    '',
    \`${S.designName}\${input.designName}\`,
    \`${S.nodeId}\${input.designId}\`,
    \`${S.designLinkOnly}\${input.figmaUrl}\`,
    \`${S.repoPath}\${input.repoPath}\`,
    current,
    '',
    '${S.sampleTexts}',
    texts,
    '',
    '${S.candidatesTitle}',
    catalog,
    '',
    '${S.rematchReq}',
    '${S.r1}',
    '${S.r2}',
    '${S.r2a}',
    '${S.r2b}',
    '${S.r2c}',
    '${S.r3}',
    '${S.r4}',
    '${S.r5}',
  ].join('\\n')
}

export function formatDesignSnapshot(
  root: {
    id: string
    name: string
    kind: string
    text?: string
    box: { x?: number; y?: number; width?: number; height?: number }
    style: Record<string, unknown>
    children: Array<unknown>
  },
  options: { maxNodes?: number } = {},
): string {
  const maxNodes = options.maxNodes ?? 80
  const lines: string[] = []
  let count = 0

  const walk = (
    node: {
      id: string
      name: string
      kind: string
      text?: string
      box: { x?: number; y?: number; width?: number; height?: number }
      style: Record<string, unknown>
      children: Array<unknown>
    },
    depth: number,
  ) => {
    if (count >= maxNodes) return
    count += 1
    const indent = '  '.repeat(Math.min(depth, 6))
    const box = node.box || {}
    const size =
      typeof box.width === 'number' || typeof box.height === 'number'
        ? \` \${Math.round(Number(box.width) || 0)}x\${Math.round(Number(box.height) || 0)}\`
        : ''
    const text = node.text ? \` "\${String(node.text).slice(0, 40)}"\` : ''
    const styleBits: string[] = []
    const s = node.style || {}
    if (s.fontSize != null) styleBits.push(\`fs=\${s.fontSize}\`)
    if (s.fontWeight != null) styleBits.push(\`fw=\${s.fontWeight}\`)
    if (s.color != null) styleBits.push(\`color=\${s.color}\`)
    if (s.backgroundColor != null) styleBits.push(\`bg=\${s.backgroundColor}\`)
    if (s.cornerRadius != null) styleBits.push(\`r=\${s.cornerRadius}\`)
    const style = styleBits.length ? \` {\${styleBits.join(', ')}}\` : ''
    lines.push(
      \`\${indent}- [\${node.id}] \${node.kind} \${node.name || ''}\${text}\${size}\${style}\`.trimEnd(),
    )
    for (const child of node.children || []) {
      walk(child as typeof node, depth + 1)
    }
  }

  walk(root, 0)
  if (count >= maxNodes) {
    lines.push(\`...(truncated to first \${maxNodes} nodes)\`)
  }
  return lines.join('\\n')
}

export function formatStaticDiffSummary(
  diffs: Array<{
    nodeName?: string
    property?: string
    severity?: string
    expected?: unknown
    actual?: unknown
  }>,
  options: { max?: number } = {},
): string {
  const max = options.max ?? 40
  if (!diffs.length) return '${S.noStaticDiff}'
  return diffs
    .slice(0, max)
    .map((d, i) => {
      const sev =
        d.severity === 'high' ? '${S.high}' : d.severity === 'medium' ? '${S.mid}' : '${S.low}'
      return \`\${i + 1}. [\${sev}] \${d.nodeName || '?'} \\u00b7 \${d.property || '?'}\\uff1a${S.designExpect} \${formatPromptValue(d.expected)} / ${S.codeExpect} \${formatPromptValue(d.actual)}\`
    })
    .join('\\n')
}
`

writeFileSync(out, src, 'utf8')
console.log('wrote', out, 'bytes', Buffer.byteLength(src, 'utf8'))
