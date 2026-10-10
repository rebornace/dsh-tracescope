/**
 * `/tracescope` command: opens guidance for the sidebar, or generates a
 * deterministic report from the command line (`<repo> <base> <head> [dir]`).
 */
import type { Context } from '../dsh-shims.js'
import { runAnalyze } from '../services/run-analyze.js'
import { resolveHostLang } from '../i18n/lang.js'
import { ui, pickLang } from '../i18n/ui.js'

type CommandResult =
  | { kind: 'success'; text: string }
  | { kind: 'error'; text: string }

function usage(lang: ReturnType<typeof resolveHostLang>) {
  return [
    ui('CLI_OPEN', lang),
    pickLang(
      lang,
      '仓库可填本地路径或远端地址（https://… / git@… / github.com/org/repo）。',
      'Repo can be a local path or remote URL (https://… / git@… / github.com/org/repo).',
    ),
    ui('CLI_CMD', lang),
    ui('CLI_AI', lang),
  ].join('\n')
}

export function registerCliCommand(ctx: Context) {
  ctx.commands.register({
    name: 'tracescope',
    description: ui('CLI_DESC', resolveHostLang(ctx)),
    input: { hint: '[<repo> <baseCommit> <headCommit> [exportDir]]' },
    handler: async (invocation: { rawInput: string }): Promise<CommandResult> => {
      const lang = resolveHostLang(ctx)
      const parts = invocation.rawInput.trim().split(/\s+/).filter(Boolean)
      if (parts.length < 3) {
        return {
          kind: 'success',
          text: [
            pickLang(
              lang,
              '可视化：右侧栏会尽量在新会话就绪后自动打开 TraceScope；也可点引导页「TraceScope」。',
              'UI: the right sidebar tries to open TraceScope when a session is ready; or tap “TraceScope” on the guide.',
            ),
            pickLang(
              lang,
              '若仍看不到右侧栏，多半是 DSH 在空白首页未挂载会话栏——进入会话页后再试（不必先发消息也可以，取决于客户端版本）。',
              'If the sidebar is missing, DSH may not mount it on a blank home — open a session page and retry.',
            ),
            pickLang(
              lang,
              'AI 分析请用面板「AI 智能分析」，在会话里互动后再 publish。',
              'For AI analysis use the panel “AI analysis”, chat, then publish.',
            ),
            pickLang(
              lang,
              '失败反馈可复制，或在配置协作平台后点「提交缺陷」。',
              'Copy failure feedback, or submit a defect after configuring a tracker.',
            ),
            '',
            usage(lang),
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
            ui('AGENT_ANALYZE_SUMMARY', lang, {
              direct: result.report.direct.length,
              ripple: result.report.ripple.length,
            }),
            pickLang(lang, '（规则分析）', '(Rule analysis)'),
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
