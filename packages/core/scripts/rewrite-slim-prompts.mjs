/**
 * Rewrite the three AI starter prompts into slim skill-driven briefs.
 * Uses \\u escapes in the generated source so Windows editors cannot corrupt Chinese.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const path = resolve(here, '../src/chat-prompt.ts')
let src = readFileSync(path, 'utf8')

const chatFn = `export function buildChatAnalysisPrompt(input: {
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
          \`\\u5173\\u8054\\u5DE5\\u4F5C\\u9879 \${related.length} \\u4E2A\\uFF1A\`,
          ...related.slice(0, 8).map((item, idx) => {
            const cat = item.category ? \`[\${item.category}] \` : ''
            return \`\${idx + 1}. \${cat}\${item.subject}\\uff08id: \${item.id}\\uff09\`
          }),
        ]

  return [
    '\\u8BF7\\u5148\\u52A0\\u8F7D skill \\u300Ctracescope-impact-analysis\\u300D\\uFF0C\\u6309\\u5176\\u6D41\\u7A0B\\u5B8C\\u6210\\u672C\\u6B21\\u529F\\u80FD\\u5F71\\u54CD\\u5206\\u6790\\uFF0C\\u518D\\u7528\\u5DE5\\u5177\\u5199\\u56DE\\u4FA7\\u680F\\u3002',
    '',
    \`\\u4EFB\\u52A1 ID\\uFF1A\${input.jobId}\`,
    \`\\u4ED3\\u5E93\\uFF1A\${input.repoPath}\`,
    \`base\\uFF1A\${input.baseCommit}\`,
    \`head\\uFF1A\${input.headCommit}\`,
    input.accessMode === 'codeup'
      ? '\\u8BBF\\u95EE\\u6A21\\u5F0F\\uFF1ACodeup\\uFF08\\u4F18\\u5148\\u7528 tracescope / Codeup \\u5DE5\\u5177\\u53D6 diff\\uFF09'
      : '',
    ...relatedBlock,
    '',
    '\\u5199\\u56DE\\u5DE5\\u5177\\uFF1Atracescope_publish_handtest\\uFF08jobId \\u5FC5\\u987B\\u4E0E\\u4E0A\\u6587\\u4E00\\u81F4\\uFF09\\u3002',
  ]
    .filter((l) => l !== '')
    .join('\\n')
}`

const codeFn = `export function buildCodeVisualPrompt(input: CodeVisualPromptInput): string {
  const mode: CodeVisualManifestMode = input.manifestMode ?? 'android-xml'
  const manifestLabel =
    mode === 'android-xml'
      ? '\\u4F9D\\u8D56\\u6E05\\u5355\\uff08\\u8BF7\\u6309\\u6E05\\u5355\\u9605\\u8BFB\\u771F\\u5B9E\\u6E90\\u7801\\uff09\\uFF1A'
      : '\\u5165\\u53E3\\u4E0E\\u5173\\u8054\\u6587\\u4EF6\\uff08\\u8BF7\\u6309\\u6E05\\u5355\\u9605\\u8BFB\\u771F\\u5B9E\\u6E90\\u7801\\uff09\\uFF1A'

  return [
    '\\u8BF7\\u5148\\u52A0\\u8F7D skill \\u300Ctracescope-ui-review\\u300D\\uFF0C\\u6309\\u5176\\u6D41\\u7A0B\\u5B8C\\u6210\\u672C\\u9875 UI \\u8D70\\u67E5\\uFF0C\\u518D\\u7528\\u5DE5\\u5177\\u5199\\u56DE\\u4FA7\\u680F\\u3002',
    '\\u4E0D\\u8981\\u8BBF\\u95EE figma.com\\uFF0C\\u4E5F\\u4E0D\\u8981\\u8C03\\u7528 Figma REST API\\u3002',
    '',
    input.jobId ? \`\\u4EFB\\u52A1 ID\\uFF1A\${input.jobId}\` : '',
    \`\\u8BBE\\u8BA1\\u9875\\uFF1A\${input.designName}\`,
    \`\\u4ED3\\u5E93\\uFF1A\${input.repoPath}\`,
    \`\\u6280\\u672F\\u6808\\uFF1A\${input.platformLabel ?? 'Android XML'}\`,
    \`\\u5165\\u53E3\\u6587\\u4EF6\\uFF1A\${input.codeRelativePath}\`,
    input.designImageUrl
      ? \`\\u8BBE\\u8BA1\\u6E32\\u67D3\\u56FE\\uff08\\u591A\\u6A21\\u6001\\u53EF\\u76F4\\u63A5\\u67E5\\u770B\\uff09\\uFF1A\${input.designImageUrl}\`
      : '\\u8BBE\\u8BA1\\u6E32\\u67D3\\u56FE\\uFF1A\\u6682\\u65E0\\uFF1B\\u9700\\u8981\\u8282\\u70B9\\u7ED3\\u6784/\\u6587\\u6848\\u65F6\\u8C03\\u7528 tracescope_get_design_snapshot\\u3002',
    input.staticDiffSummary
      ? \`\\u9759\\u6001\\u5DEE\\u5F02\\u6458\\u8981\\uff08\\u4EC5\\u4F5C\\u7EBF\\u7D22\\uff09\\uFF1A\\n\${input.staticDiffSummary}\`
      : '',
    input.gitSummary ? \`Git \\u4E0A\\u4E0B\\u6587\\uFF1A\\n\${input.gitSummary}\` : '',
    '',
    manifestLabel,
    input.dependencyManifest,
    '',
    '\\u9700\\u8981\\u8BBE\\u8BA1\\u6811/\\u8282\\u70B9\\u7EC6\\u8282\\u65F6\\uFF1Atracescope_get_design_snapshot\\uff08\\u4F20\\u4E0A\\u6587 jobId\\uff09\\u3002',
    '\\u5199\\u56DE\\u5DE5\\u5177\\uFF1Atracescope_publish_visual_findings\\uFF08jobId \\u5FC5\\u987B\\u4E0E\\u4E0A\\u6587\\u4E00\\u81F4\\uFF09\\u3002',
  ]
    .filter((l) => l !== '')
    .join('\\n')
}`

const rematchFn = `export function buildPageRematchPrompt(input: PageRematchPromptInput): string {
  const texts =
    input.sampleTexts.length > 0
      ? input.sampleTexts.map((t, i) => \`\${i + 1}. \${t}\`).join('\\n')
      : '\\uFF08\\u51E0\\u4E4E\\u6CA1\\u6709\\u53EF\\u8BFB\\u6587\\u6848\\uFF1B\\u4E3B\\u8981\\u4F9D\\u636E\\u9875\\u9762\\u540D\\u4E0E\\u5019\\u9009\\u8DEF\\u5F84\\uFF09'

  const catalog =
    input.candidates.length > 0
      ? input.candidates
          .map((c, i) => {
            const reasons = c.reasons.length ? \`\\uFF1B\${c.reasons.join('\\u3001')}\` : ''
            return \`\${i + 1}. [\${c.kindLabel}] \${c.relativePath} (\${Math.round(c.score * 100)}%, \${c.adapterId})\${reasons}\`
          })
          .join('\\n')
      : '\\uFF08\\u65E0\\u9759\\u6001\\u5019\\u9009\\uFF1B\\u8BF7\\u5728\\u4ED3\\u5E93\\u4E2D\\u641C\\u7D22\\uFF09'

  const current = input.currentSelection
    ? \`\\u5F53\\u524D\\u5DF2\\u9009\\uFF1A\${input.currentSelection.relativePath} (\${input.currentSelection.adapterId})\`
    : '\\u5F53\\u524D\\u672A\\u9009\\u5B9A\\u4EE3\\u7801\\u6587\\u4EF6'

  return [
    '\\u8BF7\\u5148\\u52A0\\u8F7D skill \\u300Ctracescope-page-match\\u300D\\uFF0C\\u6309\\u5176\\u6D41\\u7A0B\\u63A8\\u8350\\u6587\\u4EF6\\u5E76\\u5199\\u56DE\\u4FA7\\u680F\\u3002',
    '\\u4E0D\\u8981\\u8BBF\\u95EE figma.com\\uFF0C\\u4E5F\\u4E0D\\u8981\\u8C03\\u7528 Figma REST API\\u3002',
    '',
    input.jobId ? \`\\u4EFB\\u52A1 ID\\uFF1A\${input.jobId}\` : '',
    \`\\u8BBE\\u8BA1\\u9875\\uFF1A\${input.designName}\`,
    \`node-id\\uFF1A\${input.designId}\`,
    \`\\u4ED3\\u5E93\\uFF1A\${input.repoPath}\`,
    current,
    '',
    '\\u8BBE\\u8BA1\\u6587\\u6848\\u6837\\u672C\\uFF1A',
    texts,
    '',
    '\\u9759\\u6001\\u5019\\u9009\\uff08\\u4EC5\\u4F5C\\u7EBF\\u7D22\\uff09\\uFF1A',
    catalog,
    '',
    '\\u5199\\u56DE\\u5DE5\\u5177\\uFF1Atracescope_publish_page_rematch\\uFF08jobId \\u5FC5\\u987B\\u4E0E\\u4E0A\\u6587\\u4E00\\u81F4\\uFF09\\u3002',
  ]
    .filter((l) => l !== '')
    .join('\\n')
}`

function replaceFunction(source, name, next) {
  const re = new RegExp(`export function ${name}\\([\\s\\S]*?\\n\\}\\n`)
  if (!re.test(source)) throw new Error(`fn not found: ${name}`)
  return source.replace(re, `${next}\n`)
}

src = replaceFunction(src, 'buildChatAnalysisPrompt', chatFn)
src = replaceFunction(src, 'buildCodeVisualPrompt', codeFn)
src = replaceFunction(src, 'buildPageRematchPrompt', rematchFn)

writeFileSync(path, src, 'utf8')
console.log(
  'rewrote',
  path,
  'skills=',
  [
    src.includes('tracescope-impact-analysis'),
    src.includes('tracescope-ui-review'),
    src.includes('tracescope-page-match'),
  ].join(','),
)
