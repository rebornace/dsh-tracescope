import { readFileSync, writeFileSync } from 'node:fs'

const path = new URL('../src/chat-prompt.ts', import.meta.url)
let s = readFileSync(path, 'utf8')

const from = `请按下列步骤完成：',\n    step1,\n    '2. 对照设计快照 / 渲染图，列出真问题（忽略合理的动态宽高与设备差异）。',\n    '3. 每条问题给出期望 vs 实际、涉及文件与修改建议。',\n    step4,\n    '5. 可与我在本会话继续追问、纠正误判；不要一次说死后无法修改。',\n    input.jobId\n      ? \`6. 完成后调用 tracescope_publish_visual_findings，传入 jobId = \${input.jobId}，把 findings 写回 TraceScope 侧栏（含 title/severity/nodeId/expected/actual/suggestion）。写回成功后侧栏会刷新。\`\n      : '',`

const to = `请按下列要求完成（先写回，再在会话里简述）：',\n    step1,\n    '2. 对照设计快照 / 渲染图，只列真问题（忽略合理的动态宽高与设备差异；静态差异摘要仅作线索，可推翻）。',\n    '3. 每条问题给出期望 vs 实际、涉及文件与修改建议。',\n    step4,\n    '5. 必须调用 tracescope_publish_visual_findings 写回侧栏（否则插件不会刷新结论）：',\n    input.jobId\n      ? \`   - jobId 必须是：\${input.jobId}\`\n      : '   - jobId：使用上文任务 ID',\n    '   - findings：JSON 数组 [{title,severity,nodeId?,location?,expected?,actual?,codeSource?,suggestion?}]',\n    '   - summary：可选一句话总结',\n    '6. 写回后，在会话里用中文简要说明要点。若我纠正或补充，请修正后再次调用同工具写回（可多次），不要只聊天不写回。',`

if (!s.includes(from)) {
  console.error('from block not found')
  process.exit(1)
}
s = s.replace(from, to)

// Prefer 臆造 wording if a bogus lookalike appears in chat analysis / code visual intros.
s = s.replaceAll('不要膺造', '不要臆造')
s = s.replaceAll('不要膺造未列出', '不要臆造未列出')

writeFileSync(path, s, 'utf8')
console.log('patched code visual steps')
console.log('has publish-first', s.includes('先写回，再在会话里简述'))
console.log('has re-publish', s.includes('再次调用同工具写回'))
