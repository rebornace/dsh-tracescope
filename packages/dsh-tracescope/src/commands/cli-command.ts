/**
 * `/tracescope` command: opens guidance for the sidebar, or generates a
 * deterministic report from the command line (`<repo> <base> <head> [dir]`).
 */
import type { Context } from '../dsh-shims.js'
import { runAnalyze } from '../services/run-analyze.js'

const USAGE = [
  '打开方式：会话页右上角展开右侧栏 → 引导页点「TraceScope」。',
  '仓库可填本地路径或远端地址（https://… / git@… / github.com/org/repo）。',
  '命令行：/tracescope <repo> <baseCommit> <headCommit> [exportDir]',
  '模型分析：面板点「模型对话分析」→ 在会话里互动 → Agent 调用 tracescope_publish_handtest 后清单自动刷新。',
].join('\n')

type CommandResult =
  | { kind: 'success'; text: string }
  | { kind: 'error'; text: string }

export function registerCliCommand(ctx: Context) {
  ctx.commands.register({
    name: 'tracescope',
    description: '打开右侧 TraceScope 面板，或命令行生成确定性手测范围报告',
    input: { hint: '[<repo> <baseCommit> <headCommit> [exportDir]]' },
    handler: async (invocation: { rawInput: string }): Promise<CommandResult> => {
      const parts = invocation.rawInput.trim().split(/\s+/).filter(Boolean)
      if (parts.length < 3) {
        return {
          kind: 'success',
          text: [
            '可视化：右侧栏会尽量在新会话就绪后自动打开 TraceScope；也可点引导页「TraceScope」。',
            '若仍看不到右侧栏，多半是 DSH 在空白首页未挂载会话栏——进入会话页后再试（不必先发消息也可以，取决于客户端版本）。',
            '模型分析请用面板「模型对话分析」，在会话里互动后再 publish。',
            '失败反馈可复制，或在配置协作平台后点「提交缺陷」。',
            '',
            USAGE,
          ].join('\n'),
        }
      }
      try {
        const [repoPath, baseCommit, headCommit, exportDir] = parts
        const result = await runAnalyze({
          repoPath: repoPath!,
          baseCommit: baseCommit!,
          headCommit: headCommit!,
          exportDir,
        })
        return {
          kind: 'success',
          text: [
            `直接变更 ${result.report.direct.length} · 可能波及 ${result.report.ripple.length}`,
            '（确定性分析）',
            '',
            result.markdown.slice(0, 12_000),
          ].join('\n'),
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        return { kind: 'error', text: message }
      }
    },
  })
}
