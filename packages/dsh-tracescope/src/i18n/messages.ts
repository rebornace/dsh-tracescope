import type { Lang } from './lang.js'

export const ERROR_MESSAGES: Record<string, { zh: string; en: string }> = {
  ERR_METHOD_NOT_ALLOWED: {
    zh: 'method not allowed（需要 {method}，收到 {reqMethod}）',
    en: 'Method not allowed (expected {method}, got {reqMethod})',
  },
  ERR_UNTRUSTED: {
    zh: 'untrusted request',
    en: 'Untrusted request',
  },
  ERR_BODY_TOO_LARGE: {
    zh: '请求体过大，请缩小清单后重试',
    en: 'Request body too large; reduce the payload and try again',
  },
  ERR_INVALID_BODY: {
    zh: 'invalid body',
    en: 'Invalid request body',
  },
  ERR_MISSING_REPO_PATH: {
    zh: '缺少 repoPath（本地路径或远端地址）',
    en: 'Missing repoPath (local path or remote URL)',
  },
  ERR_MISSING_REPO_COMMITS: {
    zh: '需要 repoPath、baseCommit、headCommit',
    en: 'repoPath, baseCommit, and headCommit are required',
  },
  ERR_MISSING_REPO_COMMITS_REPORT: {
    zh: '需要 repoPath、baseCommit、headCommit、report',
    en: 'repoPath, baseCommit, headCommit, and report are required',
  },
  ERR_MISSING_STATUS_FIELDS: {
    zh: '需要 repoPath、baseCommit、headCommit、itemId、status',
    en: 'repoPath, baseCommit, headCommit, itemId, and status are required',
  },
  ERR_INVALID_STATUS: {
    zh: 'status 必须是 pending|pass|fail|skip',
    en: 'status must be one of pending|pass|fail|skip',
  },
  ERR_MISSING_ID: {
    zh: '缺少 id',
    en: 'Missing id',
  },
  ERR_MISSING_JOB_ID: {
    zh: '缺少 jobId',
    en: 'Missing jobId',
  },
  ERR_MISSING_URL: {
    zh: '缺少 url',
    en: 'Missing url',
  },
  ERR_JOB_NOT_FOUND: {
    zh: '找不到任务 {id}',
    en: 'Job not found: {id}',
  },
  ERR_VISUAL_JOB_NOT_FOUND: {
    zh: '找不到 UI 走查任务 {id}',
    en: 'Visual review job not found: {id}',
  },
  ERR_REMATCH_JOB_NOT_FOUND: {
    zh: '找不到文件匹配任务 {id}',
    en: 'Page rematch job not found: {id}',
  },
  ERR_HISTORY_NOT_FOUND: {
    zh: '找不到历史任务 {id}',
    en: 'History entry not found: {id}',
  },
  ERR_HISTORY_DELETE_FAILED: {
    zh: '找不到或无法删除历史任务 {id}',
    en: 'History entry not found or could not be deleted: {id}',
  },
  ERR_REPORT_REQUIRED_FIRST: {
    zh: '请先生成验证清单，再上传任务附件',
    en: 'Generate the verification checklist before uploading task attachments',
  },
  ERR_MAX_ATTACHMENTS: {
    zh: '任务附件最多 {max} 个',
    en: 'At most {max} task attachments allowed',
  },
  ERR_MISSING_ATTACHMENT_NAME: {
    zh: '缺少附件文件名',
    en: 'Missing attachment file name',
  },
  ERR_EMPTY_ATTACHMENT: {
    zh: '附件内容为空',
    en: 'Attachment content is empty',
  },
  ERR_ATTACHMENT_UPLOAD_SOURCE: {
    zh: '请选择文件，或填写本机绝对路径（适合大视频）',
    en: 'Choose a file or provide a local absolute path (recommended for large videos)',
  },
  ERR_MISSING_ATTACHMENT_ID: {
    zh: '缺少附件 id',
    en: 'Missing attachment id',
  },
  ERR_ATTACHMENT_NOT_FOUND: {
    zh: '找不到该附件',
    en: 'Attachment not found',
  },
  ERR_ATTACHMENTS_ACTION_INVALID: {
    zh: 'action 必须是 list|upload|delete|download',
    en: 'action must be list|upload|delete|download',
  },
  ERR_EXPORT_REPORT_MISSING: {
    zh: '需要 report，或 repoPath + baseCommit + headCommit',
    en: 'Provide report, or repoPath + baseCommit + headCommit',
  },
  ERR_EXPORT_REPORT_NOT_FOUND: {
    zh: '找不到可导出的清单',
    en: 'No exportable checklist found',
  },
  ERR_INVALID_IMAGE_URL: {
    zh: '无效的图片链接',
    en: 'Invalid image URL',
  },
  ERR_IMAGE_HTTP_ONLY: {
    zh: '仅支持 http(s) 图片',
    en: 'Only http(s) image URLs are supported',
  },
  ERR_IMAGE_PROXY_DOMAIN: {
    zh: '不允许代理该图片域名',
    en: 'Proxying this image host is not allowed',
  },
  ERR_IMAGE_PROXY_FAILED: {
    zh: '图片代理失败：{status} {statusText}',
    en: 'Image proxy failed: {status} {statusText}',
  },
  ERR_IMAGE_PROXY_NOT_IMAGE: {
    zh: '代理目标不是图片',
    en: 'Proxy target is not an image',
  },
  ERR_IMAGE_TOO_LARGE: {
    zh: '图片过大，无法代理',
    en: 'Image is too large to proxy',
  },
  ERR_CRASH_PROVIDER: {
    zh: '不支持的崩溃数据源：{provider}',
    en: 'Unsupported crash data provider: {provider}',
  },
  ERR_CRASH_UMENG_NOT_READY: {
    zh: '友盟 Console 取数尚未就绪（cookie present: {cookie}）',
    en: 'Umeng console provider is not ready (cookie present: {cookie})',
  },
  ERR_CRASH_MISSING_INCIDENT: {
    zh: '缺少有效的 incident（需 id 与 stackText）',
    en: 'Missing a valid incident (id and stackText required)',
  },
  ERR_TRACKER_UNSUPPORTED: {
    zh: '不支持的协作平台',
    en: 'Unsupported collaboration platform',
  },
  ERR_TRACKER_NOT_CONFIGURED: {
    zh: '请先在「仓库配置 → 协作平台」中选择平台并保存完整配置',
    en: 'Configure the collaboration platform under Repository settings and save a complete profile first',
  },
  ERR_MISSING_REPORT: {
    zh: '缺少 report',
    en: 'Missing report',
  },
  ERR_NO_FAILED_ITEMS: {
    zh: '当前没有标记为失败的条目',
    en: 'No items are marked as failed',
  },
  ERR_SUBMIT_DEFECT_FAILED: {
    zh: '提交缺陷失败{detail}',
    en: 'Failed to submit defect{detail}',
  },
  ERR_YUNXIAO_TOKEN_REQUIRED: {
    zh: '请先填写云效访问令牌并保存，或在本次请求中传入 token',
    en: 'Save a Yunxiao access token first, or pass token in this request',
  },
  ERR_YUNXIAO_ORGS_FAILED: {
    zh: '获取企业列表失败',
    en: 'Failed to list organizations',
  },
  ERR_YUNXIAO_PROJECTS_FAILED: {
    zh: '获取项目列表失败',
    en: 'Failed to list projects',
  },
  ERR_YUNXIAO_WORKITEM_TYPES_FAILED: {
    zh: '获取缺陷类型失败',
    en: 'Failed to list work item types',
  },
  ERR_YUNXIAO_MEMBERS_FAILED: {
    zh: '获取成员列表失败',
    en: 'Failed to list members',
  },
  ERR_YUNXIAO_WORKITEMS_FAILED: {
    zh: '获取工作项失败',
    en: 'Failed to list work items',
  },
  ERR_YUNXIAO_ACTION_INVALID: {
    zh: 'action 必须是 organizations|projects|workitemTypes|members|workitems',
    en: 'action must be organizations|projects|workitemTypes|members|workitems',
  },
  ERR_PATH_NOT_DIRECTORY: {
    zh: '路径不是文件夹：{path}（请点「浏览…」选择代码文件夹）',
    en: 'Path is not a directory: {path} (use Browse… to pick a code folder)',
  },
  ERR_LOCAL_PATH_MISSING: {
    zh: '本地文件夹不存在：{path}（请点「浏览…」重新选择代码文件夹）',
    en: 'Local folder does not exist: {path} (use Browse… to pick the code folder again)',
  },
  ERR_LOCAL_PATH_INACCESSIBLE: {
    zh: '无法访问本地路径：{path}（请点「浏览…」重新选择代码文件夹）',
    en: 'Cannot access local path: {path} (use Browse… to pick the code folder again)',
  },
  ERR_DESIGN_CREDENTIALS_REQUIRED: {
    zh: '需要设计稿链接和访问凭证（Figma Token 或蓝湖 Cookie）',
    en: 'Design URL and credentials are required (Figma token or Lanhu cookie)',
  },
  ERR_MISSING_REPO_PATH_SIMPLE: {
    zh: '缺少 repoPath',
    en: 'Missing repoPath',
  },
  ERR_MISSING_REPO_ADAPTER_PATH: {
    zh: '需要 repoPath、adapterId、relativePath',
    en: 'repoPath, adapterId, and relativePath are required',
  },
  ERR_PAGE_GONE: {
    zh: '所选页面已不存在，请重新匹配',
    en: 'The selected page no longer exists; rematch the design page',
  },
  ERR_MISSING_NODE_ID: {
    zh: '需要 nodeId',
    en: 'nodeId is required',
  },
  ERR_MISSING_NODE_IDS: {
    zh: '需要 nodeIds',
    en: 'nodeIds are required',
  },
  ERR_DESIGN_URL_UNRECOGNIZED: {
    zh: '无法识别的设计稿链接。请粘贴 Figma（figma.com）或蓝湖（lanhuapp.com）链接；蓝湖需填 Cookie，不是 Figma Token。',
    en: 'Unrecognized design URL. Paste a Figma (figma.com) or Lanhu (lanhuapp.com) link; Lanhu requires a cookie, not a Figma token.',
  },
  ERR_FIGMA_NODE_ID_REQUIRED: {
    zh: '单页扫描需要链接中包含 node-id',
    en: 'Single-page scan requires node-id in the design URL',
  },
  ERR_FIGMA_BLANK_LAYER: {
    zh: '当前链接指向的节点「{name}」是空白图层（不含文案或控件）。请在 Figma 中选中真正的画板 / 界面 Frame 后复制链接。',
    en: 'The linked node “{name}” is an empty layer (no text or controls). In Figma, select a real frame/screen and copy that link.',
  },
  ERR_LANHU_IMAGE_ID_REQUIRED: {
    zh: '单页扫描需要蓝湖链接中包含 image_id',
    en: 'Single-page scan requires image_id in the Lanhu URL',
  },
  ERR_LANHU_BLANK_LAYER: {
    zh: '当前蓝湖设计稿「{name}」是空白图层（不含文案或控件）。请打开真正的界面画板后复制链接。',
    en: 'Lanhu design “{name}” is an empty layer (no text or controls). Open a real screen artboard and copy that link.',
  },
  ERR_LANHU_NO_DESIGNS: {
    zh: '该蓝湖项目下没有可扫描的设计稿',
    en: 'No scannable designs in this Lanhu project',
  },
  ERR_LANHU_ANNOTATIONS_FAILED: {
    zh: '未能解析任何蓝湖设计稿标注（请确认 Cookie 有效且稿件已生成标注）',
    en: 'Could not parse any Lanhu design annotations (check cookie and that specs were generated)',
  },
  ERR_MISSING_REPO_ADAPTER_PATH_SLASH: {
    zh: '缺少 repoPath / adapterId / relativePath',
    en: 'Missing repoPath / adapterId / relativePath',
  },
  ERR_UNKNOWN_ADAPTER: {
    zh: '未知适配器：{adapterId}',
    en: 'Unknown adapter: {adapterId}',
  },
  ERR_MISSING_REPO_FIGMA_PATH: {
    zh: '缺少 repoPath / figmaUrl / designId / relativePath',
    en: 'Missing repoPath / figmaUrl / designId / relativePath',
  },
  ERR_MISSING_REPO_DESIGN_ID: {
    zh: '缺少 repoPath / designId',
    en: 'Missing repoPath / designId',
  },
  ERR_STATIC_MATCH_FAILED: {
    zh: '静态匹配失败：{detail}',
    en: 'Static match failed: {detail}',
  },
  ERR_LLM_UNAVAILABLE: {
    zh: '当前环境未提供可用的大模型服务（llm）',
    en: 'No LLM service is available in this environment',
  },
  ERR_LLM_CALL_FAILED: {
    zh: '大模型调用失败：{detail}',
    en: 'LLM call failed: {detail}',
  },
  ERR_LLM_EMPTY_OUTPUT: {
    zh: '大模型未返回任何内容（可能是网络或通道异常）',
    en: 'LLM returned no output (network or channel issue)',
  },
  ERR_INVALID_JSON: {
    zh: '{label} 不是合法 JSON',
    en: '{label} is not valid JSON',
  },
  ERR_VISUAL_JOB_NO_DESIGN: {
    zh: '任务 {jobId} 没有挂载设计树；请重新发起 tracescope_start_visual_review',
    en: 'Job {jobId} has no design tree; restart with tracescope_start_visual_review',
  },
  ERR_DESIGN_NODE_NOT_FOUND: {
    zh: '设计树中找不到节点 {nodeId}',
    en: 'Node {nodeId} not found in design tree',
  },
  ERR_PICKS_NOT_ARRAY: {
    zh: 'picks 必须是数组',
    en: 'picks must be an array',
  },
  ERR_PICKS_EMPTY: {
    zh: 'picks 为空或缺少 relativePath',
    en: 'picks is empty or missing relativePath',
  },
  ERR_JOB_NOT_REMATCH: {
    zh: '任务 {jobId} 不是文件匹配任务（kind={kind}）',
    en: 'Job {jobId} is not a page rematch job (kind={kind})',
  },
  ERR_GIT_HISTORY_READ_FAILED: {
    zh: '无法读取 git 历史：{detail}',
    en: 'Could not read git history: {detail}',
  },
  ERR_MISSING_EXPORT_REPORT: {
    zh: '需要 exportDir 与 report',
    en: 'exportDir and report are required',
  },
  ERR_FIGMA_TOKEN_REQUIRED: {
    zh: '需要 Figma 链接和访问 Token',
    en: 'Figma URL and access token are required',
  },
  ERR_CODE_LAYOUT_PATH_REQUIRED: {
    zh: '需要代码布局文件路径',
    en: 'Code layout file path is required',
  },
  ERR_CODE_FILE_NOT_FOUND: {
    zh: '找不到代码文件：{path}',
    en: 'Code file not found: {path}',
  },
  ERR_LAYOUT_FILE_READ_FAILED: {
    zh: '无法读取布局文件：{file}',
    en: 'Could not read layout file: {file}',
  },
}

type ErrorParams = Record<string, string | number>

export function msg(code: string, lang: Lang, params?: ErrorParams): string {
  const entry = ERROR_MESSAGES[code]
  if (!entry) return code
  const template = entry[lang] ?? entry.zh
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = params[key]
    return value === undefined || value === null ? `{${key}}` : String(value)
  })
}

export class I18nError extends Error {
  readonly code: string
  readonly lang: Lang
  readonly params?: ErrorParams

  constructor(code: string, lang: Lang, params?: ErrorParams) {
    super(msg(code, lang, params))
    this.name = 'I18nError'
    this.code = code
    this.lang = lang
    this.params = params
  }
}

/** Throw a localized error (for route handlers that have `lang`). */
export function tError(code: string, lang: Lang, params?: ErrorParams): never {
  throw new I18nError(code, lang, params)
}

const ZH_TO_CODE = new Map<string, string>()
for (const [code, texts] of Object.entries(ERROR_MESSAGES)) {
  ZH_TO_CODE.set(texts.zh, code)
}

type PatternMatcher = {
  code: string
  match: (message: string) => ErrorParams | null
}

const ERROR_PATTERNS: PatternMatcher[] = [
  {
    code: 'ERR_VISUAL_JOB_NOT_FOUND',
    match: (m) => {
      const hit = /^找不到 UI 走查任务 (.+)$/.exec(m)
      return hit ? { id: hit[1]! } : null
    },
  },
  {
    code: 'ERR_REMATCH_JOB_NOT_FOUND',
    match: (m) => {
      const hit = /^找不到文件匹配任务 (.+)$/.exec(m)
      return hit ? { id: hit[1]! } : null
    },
  },
  {
    code: 'ERR_JOB_NOT_FOUND',
    match: (m) => {
      const hit = /^找不到任务 (.+)$/.exec(m)
      return hit ? { id: hit[1]! } : null
    },
  },
  {
    code: 'ERR_HISTORY_NOT_FOUND',
    match: (m) => {
      const hit = /^找不到历史任务 (.+)$/.exec(m)
      return hit ? { id: hit[1]! } : null
    },
  },
  {
    code: 'ERR_HISTORY_DELETE_FAILED',
    match: (m) => {
      const hit = /^找不到或无法删除历史任务 (.+)$/.exec(m)
      return hit ? { id: hit[1]! } : null
    },
  },
  {
    code: 'ERR_MAX_ATTACHMENTS',
    match: (m) => {
      const hit = /^任务附件最多 (\d+) 个$/.exec(m)
      return hit ? { max: hit[1]! } : null
    },
  },
  {
    code: 'ERR_IMAGE_PROXY_FAILED',
    match: (m) => {
      const hit = /^图片代理失败：(.+) (.+)$/.exec(m)
      return hit ? { status: hit[1]!, statusText: hit[2]! } : null
    },
  },
  {
    code: 'ERR_PATH_NOT_DIRECTORY',
    match: (m) => {
      const hit = /^路径不是文件夹：(.+)（请点「浏览…」选择代码文件夹）$/.exec(m)
      return hit ? { path: hit[1]! } : null
    },
  },
  {
    code: 'ERR_LOCAL_PATH_MISSING',
    match: (m) => {
      const hit = /^本地文件夹不存在：(.+)（请点「浏览…」重新选择代码文件夹）$/.exec(m)
      return hit ? { path: hit[1]! } : null
    },
  },
  {
    code: 'ERR_LOCAL_PATH_INACCESSIBLE',
    match: (m) => {
      const hit = /^无法访问本地路径：(.+)（请点「浏览…」重新选择代码文件夹）$/.exec(m)
      return hit ? { path: hit[1]! } : null
    },
  },
  {
    code: 'ERR_UNKNOWN_ADAPTER',
    match: (m) => {
      const hit = /^未知适配器：(.+)$/.exec(m)
      return hit ? { adapterId: hit[1]! } : null
    },
  },
  {
    code: 'ERR_STATIC_MATCH_FAILED',
    match: (m) => {
      const hit = /^静态匹配失败：(.+)$/.exec(m)
      return hit ? { detail: hit[1]! } : null
    },
  },
  {
    code: 'ERR_LLM_CALL_FAILED',
    match: (m) => {
      const hit = /^大模型调用失败：(.+)$/.exec(m)
      return hit ? { detail: hit[1]! } : null
    },
  },
  {
    code: 'ERR_INVALID_JSON',
    match: (m) => {
      const hit = /^(.+) 不是合法 JSON$/.exec(m)
      return hit ? { label: hit[1]! } : null
    },
  },
  {
    code: 'ERR_VISUAL_JOB_NO_DESIGN',
    match: (m) => {
      const hit = /^任务 (.+) 没有挂载设计树；请重新发起 tracescope_start_visual_review$/.exec(m)
      return hit ? { jobId: hit[1]! } : null
    },
  },
  {
    code: 'ERR_DESIGN_NODE_NOT_FOUND',
    match: (m) => {
      const hit = /^设计树中找不到节点 (.+)$/.exec(m)
      return hit ? { nodeId: hit[1]! } : null
    },
  },
  {
    code: 'ERR_JOB_NOT_REMATCH',
    match: (m) => {
      const hit = /^任务 (.+) 不是文件匹配任务（kind=(.+)）$/.exec(m)
      return hit ? { jobId: hit[1]!, kind: hit[2]! } : null
    },
  },
  {
    code: 'ERR_GIT_HISTORY_READ_FAILED',
    match: (m) => {
      const hit = /^无法读取 git 历史：(.+)$/.exec(m)
      return hit ? { detail: hit[1]! } : null
    },
  },
  {
    code: 'ERR_CODE_FILE_NOT_FOUND',
    match: (m) => {
      const hit = /^找不到代码文件：(.+)$/.exec(m)
      return hit ? { path: hit[1]! } : null
    },
  },
  {
    code: 'ERR_LAYOUT_FILE_READ_FAILED',
    match: (m) => {
      const hit = /^无法读取布局文件：(.+)$/.exec(m)
      return hit ? { file: hit[1]! } : null
    },
  },
  {
    code: 'ERR_FIGMA_BLANK_LAYER',
    match: (m) => {
      const hit =
        /^当前链接指向的节点「(.+)」是空白图层（不含文案或控件）。请在 Figma 中选中真正的画板 \/ 界面 Frame 后复制链接。$/.exec(
          m,
        )
      return hit ? { name: hit[1]! } : null
    },
  },
  {
    code: 'ERR_LANHU_BLANK_LAYER',
    match: (m) => {
      const hit =
        /^当前蓝湖设计稿「(.+)」是空白图层（不含文案或控件）。请打开真正的界面画板后复制链接。$/.exec(m)
      return hit ? { name: hit[1]! } : null
    },
  },
  {
    code: 'ERR_METHOD_NOT_ALLOWED',
    match: (m) => {
      const hit = /^method not allowed（需要 (.+)，收到 (.+)）$/.exec(m)
      return hit ? { method: hit[1]!, reqMethod: hit[2]! } : null
    },
  },
]

function resolveErrorCode(message: string): { code: string; params?: ErrorParams } | null {
  const exact = ZH_TO_CODE.get(message)
  if (exact) return { code: exact }
  if (message === 'body too large') return { code: 'ERR_BODY_TOO_LARGE' }
  if (message === 'invalid body') return { code: 'ERR_INVALID_BODY' }
  if (message === 'untrusted request') return { code: 'ERR_UNTRUSTED' }
  for (const pattern of ERROR_PATTERNS) {
    const params = pattern.match(message)
    if (params) return { code: pattern.code, params }
  }
  return null
}

export function localizeError(
  error: unknown,
  lang: Lang,
): { error: string; code?: string } {
  if (error instanceof I18nError) {
    return {
      error: msg(error.code, lang, error.params),
      code: error.code,
    }
  }
  const message = error instanceof Error ? error.message : String(error)
  const resolved = resolveErrorCode(message)
  if (resolved) {
    return {
      error: msg(resolved.code, lang, resolved.params),
      code: resolved.code,
    }
  }
  return { error: message }
}
