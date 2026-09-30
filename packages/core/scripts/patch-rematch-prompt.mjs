import { readFileSync, writeFileSync } from 'node:fs'

const genPath = new URL('./gen-chat-prompt.mjs', import.meta.url)
let gen = readFileSync(genPath, 'utf8')

function rep(from, to, label) {
  if (!gen.includes(from)) {
    console.error('GEN missing:', label)
    process.exit(1)
  }
  gen = gen.replace(from, to)
}

rep(
  "rematchIntro:\n    '\\u8bf7\\u534f\\u52a9\\u300c\\u8bbe\\u8ba1\\u7a3f \\u2194 \\u4ee3\\u7801\\u6587\\u4ef6\\u300d\\u5339\\u914d\\uff1a\\u6839\\u636e\\u8bbe\\u8ba1\\u9875\\u4fe1\\u606f\\uff0c\\u63a8\\u8350\\u6700\\u53ef\\u80fd\\u5b9e\\u73b0\\u8be5\\u9875\\u9762\\u7684\\u4ed3\\u5e93\\u6587\\u4ef6\\u3002',",
  "rematchIntro:\n    '\\u8bf7\\u534f\\u52a9\\u300c\\u8bbe\\u8ba1\\u7a3f \\u2194 \\u4ee3\\u7801\\u6587\\u4ef6\\u300d\\u5339\\u914d\\uff1a\\u6839\\u636e\\u8bbe\\u8ba1\\u9875\\u4fe1\\u606f\\uff0c\\u63a8\\u8350\\u6700\\u53ef\\u80fd\\u5b9e\\u73b0\\u8be5\\u9875\\u9762\\u7684\\u4ed3\\u5e93\\u6587\\u4ef6\\uff0c\\u5e76\\u5199\\u56de TraceScope \\u4fa7\\u680f\\u3002',",
  'intro',
)
rep(
  "currentSelSuffix:\n    '\\u3002\\u82e5\\u4f60\\u8ba4\\u4e3a\\u9009\\u9519\\u4e86\\uff0c\\u8bf7\\u660e\\u786e\\u6307\\u51fa\\u6b63\\u786e\\u6587\\u4ef6\\u3002',",
  "currentSelSuffix:\n    '\\u3002\\u82e5\\u8ba4\\u4e3a\\u9009\\u9519\\u4e86\\uff0c\\u8bf7\\u5728\\u63a8\\u8350\\u4e2d\\u7ed9\\u51fa\\u6b63\\u786e\\u6587\\u4ef6\\u5e76\\u5199\\u56de\\u3002',",
  'sel',
)
rep(
  "candidatesTitle:\n    '\\u9759\\u6001\\u5339\\u914d\\u5019\\u9009\\uff08\\u4ec5\\u4f9b\\u53c2\\u8003\\uff0c\\u53ef\\u4ee5\\u5168\\u90e8\\u63a8\\u7ffb\\uff09\\uff1a',",
  "candidatesTitle:\n    '\\u9759\\u6001\\u5339\\u914d\\u5019\\u9009\\uff08\\u4ec5\\u4f5c\\u7ebf\\u7d22\\uff1b\\u53ef\\u63a8\\u8350\\u5217\\u8868\\u5916\\u7684\\u66f4\\u4f73\\u6587\\u4ef6\\uff09\\uff1a',",
  'cand',
)
rep(
  "rematchReq: '\\u8bf7\\u6309\\u4e0b\\u5217\\u8981\\u6c42\\u56de\\u590d\\uff1a',\n  r1: '1. \\u5fc5\\u8981\\u65f6\\u6253\\u5f00\\u5019\\u9009\\u6587\\u4ef6\\uff08\\u6216\\u641c\\u7d22\\u8def\\u7531/\\u9875\\u9762\\u540d/\\u6587\\u6848\\uff09\\u6838\\u5bf9\\uff0c\\u4e0d\\u8981\\u53ea\\u51ed\\u6587\\u4ef6\\u540d\\u81ba\\u65ad\\u3002',\n  r2: '2. \\u6309\\u7f6e\\u4fe1\\u5ea6\\u4ece\\u9ad8\\u5230\\u4f4e\\u5217\\u51fa\\u63a8\\u8350\\uff0c\\u6bcf\\u6761\\u5305\\u542b\\uff1a',\n  r2a: '   - relativePath\\uff08\\u4ed3\\u5e93\\u76f8\\u5bf9\\u8def\\u5f84\\uff09',\n  r2b: '   - adapterId\\uff08\\u82e5\\u53ef\\u77e5\\uff0c\\u5982 android-xml / android-compose / uni-app \\u7b49\\uff09',\n  r2c: '   - \\u7b80\\u77ed\\u4e2d\\u6587\\u7406\\u7531',\n  r3: '3. \\u82e5\\u5019\\u9009\\u90fd\\u4e0d\\u5bf9\\uff0c\\u76f4\\u63a5\\u7ed9\\u51fa\\u4f60\\u8ba4\\u4e3a\\u6b63\\u786e\\u7684\\u8def\\u5f84\\uff0c\\u5e76\\u8bf4\\u660e\\u641c\\u7d22\\u4f9d\\u636e\\u3002',\n  r4: '4. \\u6211\\u4f1a\\u5728 TraceScope \\u4fa7\\u680f\\u624b\\u52a8\\u9009\\u62e9\\u6587\\u4ef6\\uff1b\\u82e5\\u63a8\\u8350\\u6709\\u8bef\\uff0c\\u6211\\u4f1a\\u5728\\u672c\\u4f1a\\u8bdd\\u7ee7\\u7eed\\u8865\\u5145\\u7ebf\\u7d22\\uff08\\u9875\\u9762\\u7528\\u9014\\u3001\\u5173\\u952e\\u8bcd\\u3001\\u6a21\\u5757\\u540d\\u7b49\\uff09\\uff0c\\u8bf7\\u636e\\u6b64\\u4fee\\u6b63\\uff0c\\u4e0d\\u8981\\u575a\\u6301\\u9519\\u8bef\\u7ed3\\u8bba\\u3002',\n  r5: '5. \\u56de\\u590d\\u4fdd\\u6301\\u53ef\\u8ba8\\u8bba\\uff1a\\u5148\\u7ed9 Top 1\\uff5e3\\uff0c\\u518d\\u95ee\\u6211\\u662f\\u5426\\u9700\\u8981\\u6362\\u65b9\\u5411\\uff0c\\u800c\\u4e0d\\u662f\\u4e00\\u6b21\\u6027\\u65e0\\u6cd5\\u4fee\\u6539\\u7684\\u6b7b\\u7ed3\\u8bba\\u3002',",
  "rematchReq: '\\u8bf7\\u6309\\u4e0b\\u5217\\u8981\\u6c42\\u5b8c\\u6210\\uff08\\u5148\\u5199\\u56de\\uff0c\\u518d\\u5728\\u4f1a\\u8bdd\\u91cc\\u7b80\\u8ff0\\uff09\\uff1a',\n  rematchJobLine: '\\u672c\\u6b21\\u6587\\u4ef6\\u5339\\u914d\\u4efb\\u52a1 ID\\uff1a',\n  r1: '1. \\u5fc5\\u8981\\u65f6\\u6253\\u5f00\\u5019\\u9009\\u6216\\u641c\\u7d22\\u8def\\u7531/\\u9875\\u9762\\u540d/\\u6587\\u6848\\u6838\\u5bf9\\uff1b\\u4e0d\\u8981\\u53ea\\u51ed\\u6587\\u4ef6\\u540d\\u81ba\\u65ad\\u3002',\n  r2: '2. \\u786e\\u5b9a Top 1\\uff5e5 \\u63a8\\u8350\\uff08\\u6309\\u7f6e\\u4fe1\\u5ea6\\u964d\\u5e8f\\uff09\\u3002\\u6bcf\\u6761\\u5fc5\\u542b\\uff1a',\n  r2a: '   - relativePath\\uff08\\u4ed3\\u5e93\\u76f8\\u5bf9\\u8def\\u5f84\\uff09',\n  r2b: '   - adapterId\\uff08\\u82e5\\u53ef\\u77e5\\uff1b\\u4e0d\\u786e\\u5b9a\\u53ef\\u7528\\u5019\\u9009\\u91cc\\u540c\\u8def\\u5f84\\u7684 adapterId\\uff0c\\u6216 android-xml\\uff09',\n  r2c: '   - confidence\\uff080\\u52301\\uff09\\u4e0e\\u7b80\\u77ed\\u4e2d\\u6587 reason',\n  r3: '3. \\u82e5\\u9759\\u6001\\u5019\\u9009\\u90fd\\u4e0d\\u5bf9\\uff0c\\u76f4\\u63a5\\u63a8\\u8350\\u4ed3\\u5e93\\u5185\\u66f4\\u4f73\\u8def\\u5f84\\uff08\\u4e0d\\u5fc5\\u5c40\\u9650\\u4e8e\\u5019\\u9009\\u8868\\uff09\\u3002',\n  r4: '4. \\u5fc5\\u987b\\u8c03\\u7528 tracescope_publish_page_rematch \\u628a\\u63a8\\u8350\\u5199\\u56de\\u4fa7\\u680f\\uff08\\u5426\\u5219\\u63d2\\u4ef6\\u4e0d\\u4f1a\\u66f4\\u65b0\\u9009\\u4e2d\\u6587\\u4ef6\\uff09\\uff1a',\n  r4a: '   - jobId \\u5fc5\\u987b\\u662f\\uff1a',\n  r4b: '   - picks\\uff1aJSON \\u6570\\u7ec4 [{adapterId,relativePath,kindLabel?,score?,reason?}]\\uff0cscore \\u53ef\\u7528 confidence',\n  r4c: '   - note\\uff1a\\u53ef\\u9009\\uff0c\\u4e00\\u53e5\\u8bdd\\u603b\\u7ed3',\n  r5: '5. \\u5199\\u56de\\u540e\\uff0c\\u5728\\u4f1a\\u8bdd\\u91cc\\u7528\\u4e2d\\u6587\\u7b80\\u8981\\u8bf4\\u660e Top1 \\u4e3a\\u4f55\\u3002\\u82e5\\u6211\\u8865\\u5145\\u7ebf\\u7d22\\u6216\\u6307\\u51fa\\u9519\\u8bef\\uff0c\\u8bf7\\u4fee\\u6b63\\u540e\\u518d\\u6b21\\u8c03\\u7528\\u540c\\u5de5\\u5177\\u5199\\u56de\\uff08\\u53ef\\u591a\\u6b21\\uff09\\u3002',",
  'steps',
)

rep(
  `export interface PageRematchPromptInput {
  designName: string
  designId: string
  figmaUrl: string
  repoPath: string
  sampleTexts: string[]
  candidates: PageRematchCandidate[]
  currentSelection?: { adapterId: string; relativePath: string }
}`,
  `export interface PageRematchPromptInput {
  designName: string
  designId: string
  figmaUrl: string
  repoPath: string
  sampleTexts: string[]
  candidates: PageRematchCandidate[]
  currentSelection?: { adapterId: string; relativePath: string }
  jobId?: string
}`,
  'iface',
)

// Insert jobId line + publish steps into the generated function template.
rep(
  "    '${S.rematchIntro}',\n    '${S.rematchNoFigma}',\n    '',\n    \\`${S.designName}\\${input.designName}\\`,",
  "    '${S.rematchIntro}',\n    '${S.rematchNoFigma}',\n    '',\n    input.jobId ? \\`${S.rematchJobLine}\\${input.jobId}\\` : '',\n    \\`${S.designName}\\${input.designName}\\`,",
  'jobline',
)

rep(
  "    '${S.r4}',\n    '${S.r5}',\n  ].join('\\n')\n}",
  "    '${S.r4}',\n    input.jobId ? \\`${S.r4a}\\${input.jobId}\\` : '${S.r4a}(jobId)',\n    '${S.r4b}',\n    '${S.r4c}',\n    '${S.r5}',\n  ]\n    .filter((l) => l !== '')\n    .join('\\n')\n}",
  'publish-steps',
)

writeFileSync(genPath, gen)
console.log('gen patched')
