export interface YunxiaoConfig {
  /** OpenAPI domain, e.g. https://openapi-rdc.aliyuncs.com */
  endpoint: string
  /** Personal access token (x-yunxiao-token), e.g. pt-… */
  token: string
  /** Organization id from 云效 URL */
  organizationId: string
  /** Project / space id */
  spaceId: string
  /** Work item type id for Bug (缺陷) */
  workitemTypeId: string
  /** Assignee user id (required by 云效) */
  assignedTo: string
}

export interface YunxiaoCreateResult {
  ok: boolean
  workitemId?: string
  url?: string
  raw?: unknown
  error?: string
}

export interface YunxiaoOption {
  id: string
  name: string
}

/** Sanitized Yunxiao HTTP trace for in-panel troubleshooting (never includes the token). */
export interface YunxiaoDebugEntry {
  at: string
  method: string
  path: string
  status: number
  requestBody?: string
  responsePreview: string
  optionCount?: number
  error?: string
}

const DEBUG_PREVIEW_LIMIT = 1800

function previewJson(raw: unknown, limit = DEBUG_PREVIEW_LIMIT): string {
  let text: string
  try {
    text = typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2)
  } catch {
    text = String(raw)
  }
  if (text.length <= limit) return text
  return `${text.slice(0, limit)}\n…(truncated ${text.length - limit} chars)`
}

export function isYunxiaoConfigReady(config: Partial<YunxiaoConfig> | null | undefined): boolean {
  if (!config) return false
  return Boolean(
    config.token?.trim() &&
      config.organizationId?.trim() &&
      config.spaceId?.trim() &&
      config.workitemTypeId?.trim() &&
      config.assignedTo?.trim(),
  )
}

export function normalizeYunxiaoEndpoint(endpoint?: string): string {
  const raw = (endpoint || 'https://openapi-rdc.aliyuncs.com').trim().replace(/\/+$/, '')
  return raw || 'https://openapi-rdc.aliyuncs.com'
}

function yunxiaoHeaders(token: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-yunxiao-token': token.trim(),
  }
}

async function yunxiaoRequest(
  endpoint: string,
  token: string,
  path: string,
  init: RequestInit = {},
  fetchImpl: typeof fetch = fetch,
): Promise<{
  ok: boolean
  status: number
  raw: unknown
  error?: string
  debug: YunxiaoDebugEntry
}> {
  const base = normalizeYunxiaoEndpoint(endpoint)
  const pathOnly = path.startsWith('/') ? path : `/${path}`
  const url = `${base}${pathOnly}`
  const method = (init.method || 'GET').toUpperCase()
  const requestBody =
    typeof init.body === 'string' && init.body.trim()
      ? previewJson(init.body, 600)
      : undefined
  const at = new Date().toISOString()
  try {
    const res = await fetchImpl(url, {
      ...init,
      headers: {
        ...yunxiaoHeaders(token),
        ...(init.headers as Record<string, string> | undefined),
      },
    })
    const text = await res.text()
    let raw: unknown = text
    try {
      raw = text ? JSON.parse(text) : null
    } catch {
      /* keep text */
    }
    const debug: YunxiaoDebugEntry = {
      at,
      method,
      path: pathOnly,
      status: res.status,
      requestBody,
      responsePreview: previewJson(raw),
    }
    if (!res.ok) {
      const msg =
        typeof raw === 'object' && raw && 'errorMessage' in raw
          ? String((raw as { errorMessage?: string }).errorMessage)
          : typeof raw === 'object' && raw && 'message' in raw
            ? String((raw as { message?: string }).message)
            : text.slice(0, 400) || `HTTP ${res.status}`
      return { ok: false, status: res.status, raw, error: msg, debug: { ...debug, error: msg } }
    }
    return { ok: true, status: res.status, raw, debug }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      status: 0,
      raw: null,
      error: msg,
      debug: {
        at,
        method,
        path: pathOnly,
        status: 0,
        requestBody,
        responsePreview: '',
        error: msg,
      },
    }
  }
}

function withOptionDebug(
  debug: YunxiaoDebugEntry,
  options: YunxiaoOption[],
  error?: string,
): YunxiaoDebugEntry {
  return {
    ...debug,
    optionCount: options.length,
    error: error || debug.error,
  }
}

function asRecordArray(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) {
    return raw.filter((x) => x && typeof x === 'object') as Record<string, unknown>[]
  }
  if (!raw || typeof raw !== 'object') return []
  const obj = raw as Record<string, unknown>
  for (const key of [
    'organizations',
    'projects',
    'members',
    'workitems',
    'list',
    'items',
    'data',
    'result',
  ]) {
    const nested = obj[key]
    if (Array.isArray(nested)) {
      return nested.filter((x) => x && typeof x === 'object') as Record<string, unknown>[]
    }
  }
  // Yunxiao search often wraps rows as { result: { data: [...] } } / { data: { list: [...] } }
  for (const key of ['result', 'data']) {
    const nested = obj[key]
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const inner = asRecordArray(nested)
      if (inner.length) return inner
    }
  }
  return []
}

function toOptions(
  rows: Record<string, unknown>[],
  idKeys: string[],
  nameKeys: string[],
): YunxiaoOption[] {
  const out: YunxiaoOption[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    let id = ''
    for (const k of idKeys) {
      if (row[k] != null && String(row[k]).trim()) {
        id = String(row[k]).trim()
        break
      }
    }
    if (!id || seen.has(id)) continue
    let name = id
    for (const k of nameKeys) {
      if (row[k] != null && String(row[k]).trim()) {
        name = String(row[k]).trim()
        break
      }
    }
    seen.add(id)
    out.push({ id, name })
  }
  return out
}

/** List organizations available to the personal access token. */
export async function listYunxiaoOrganizations(
  endpoint: string,
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; options: YunxiaoOption[]; error?: string; debug: YunxiaoDebugEntry }> {
  if (!token.trim()) {
    return {
      ok: false,
      options: [],
      error: '请先填写访问令牌',
      debug: {
        at: new Date().toISOString(),
        method: 'GET',
        path: '/oapi/v1/platform/organizations',
        status: 0,
        responsePreview: '',
        error: '请先填写访问令牌',
      },
    }
  }
  const res = await yunxiaoRequest(
    endpoint,
    token,
    '/oapi/v1/platform/organizations?page=1&perPage=100',
    { method: 'GET' },
    fetchImpl,
  )
  if (!res.ok) {
    return {
      ok: false,
      options: [],
      error: res.error,
      debug: withOptionDebug(res.debug, [], res.error),
    }
  }
  const options = toOptions(
    asRecordArray(res.raw),
    // Keep `id` first — this is what list-orgs returns and what projects:search expects.
    ['id', 'organizationId', 'identifier'],
    ['name', 'organizationName'],
  )
  return {
    ok: true,
    options,
    debug: withOptionDebug(res.debug, options),
  }
}

/** List projects (spaces) under an organization. */
export async function listYunxiaoProjects(
  endpoint: string,
  token: string,
  organizationId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; options: YunxiaoOption[]; error?: string; debug: YunxiaoDebugEntry }> {
  if (!token.trim()) {
    return {
      ok: false,
      options: [],
      error: '请先填写访问令牌',
      debug: {
        at: new Date().toISOString(),
        method: 'POST',
        path: '/oapi/v1/projex/organizations/{org}/projects:search',
        status: 0,
        responsePreview: '',
        error: '请先填写访问令牌',
      },
    }
  }
  if (!organizationId.trim()) {
    return {
      ok: false,
      options: [],
      error: '请先选择企业',
      debug: {
        at: new Date().toISOString(),
        method: 'POST',
        path: '/oapi/v1/projex/organizations/{org}/projects:search',
        status: 0,
        responsePreview: '',
        error: '请先选择企业',
      },
    }
  }
  const org = encodeURIComponent(organizationId.trim())
  const res = await yunxiaoRequest(
    endpoint,
    token,
    `/oapi/v1/projex/organizations/${org}/projects:search`,
    {
      method: 'POST',
      // Keep body minimal — matching working Yunxiao PAT clients.
      // A malformed `conditions` string can yield HTTP 200 with an empty list.
      body: JSON.stringify({
        page: 1,
        perPage: 100,
      }),
    },
    fetchImpl,
  )
  if (!res.ok) {
    return {
      ok: false,
      options: [],
      error: res.error,
      debug: withOptionDebug(res.debug, [], res.error),
    }
  }
  const options = toOptions(
    asRecordArray(res.raw),
    // Prefer identifier (Projex project id) when both id/identifier exist.
    ['identifier', 'id', 'spaceId', 'projectId'],
    ['name', 'projectName', 'spaceName'],
  )
  if (!options.length) {
    const error =
      '云效返回成功但未解析到项目。请确认 PAT 含「项目只读/读写」，且所选企业下确有项目；也可在面板手动填写 spaceId。'
    return {
      ok: true,
      options: [],
      error,
      debug: withOptionDebug(res.debug, [], error),
    }
  }
  return { ok: true, options, debug: withOptionDebug(res.debug, options) }
}

/** List work item types (default Bug) for a project. */
export async function listYunxiaoWorkitemTypes(
  endpoint: string,
  token: string,
  organizationId: string,
  spaceId: string,
  category = 'Bug',
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; options: YunxiaoOption[]; error?: string; debug: YunxiaoDebugEntry }> {
  if (!token.trim()) {
    return {
      ok: false,
      options: [],
      error: '请先填写访问令牌',
      debug: {
        at: new Date().toISOString(),
        method: 'GET',
        path: '/oapi/v1/projex/organizations/{org}/projects/{project}/workitemTypes',
        status: 0,
        responsePreview: '',
        error: '请先填写访问令牌',
      },
    }
  }
  if (!organizationId.trim() || !spaceId.trim()) {
    return {
      ok: false,
      options: [],
      error: '请先选择企业和项目',
      debug: {
        at: new Date().toISOString(),
        method: 'GET',
        path: '/oapi/v1/projex/organizations/{org}/projects/{project}/workitemTypes',
        status: 0,
        responsePreview: '',
        error: '请先选择企业和项目',
      },
    }
  }
  const org = encodeURIComponent(organizationId.trim())
  const project = encodeURIComponent(spaceId.trim())
  const cat = encodeURIComponent(category || 'Bug')
  const res = await yunxiaoRequest(
    endpoint,
    token,
    `/oapi/v1/projex/organizations/${org}/projects/${project}/workitemTypes?category=${cat}`,
    { method: 'GET' },
    fetchImpl,
  )
  if (!res.ok) {
    return {
      ok: false,
      options: [],
      error: res.error,
      debug: withOptionDebug(res.debug, [], res.error),
    }
  }
  const options = toOptions(
    asRecordArray(res.raw),
    ['id', 'identifier', 'workitemTypeId'],
    ['name', 'nameEn', 'displayName'],
  )
  return { ok: true, options, debug: withOptionDebug(res.debug, options) }
}

/** List organization members for assignee selection. */
export async function listYunxiaoMembers(
  endpoint: string,
  token: string,
  organizationId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; options: YunxiaoOption[]; error?: string; debug: YunxiaoDebugEntry }> {
  if (!token.trim()) {
    return {
      ok: false,
      options: [],
      error: '请先填写访问令牌',
      debug: {
        at: new Date().toISOString(),
        method: 'GET',
        path: '/oapi/v1/platform/organizations/{org}/members',
        status: 0,
        responsePreview: '',
        error: '请先填写访问令牌',
      },
    }
  }
  if (!organizationId.trim()) {
    return {
      ok: false,
      options: [],
      error: '请先选择企业',
      debug: {
        at: new Date().toISOString(),
        method: 'GET',
        path: '/oapi/v1/platform/organizations/{org}/members',
        status: 0,
        responsePreview: '',
        error: '请先选择企业',
      },
    }
  }
  const org = encodeURIComponent(organizationId.trim())
  const res = await yunxiaoRequest(
    endpoint,
    token,
    `/oapi/v1/platform/organizations/${org}/members?page=1&perPage=100`,
    { method: 'GET' },
    fetchImpl,
  )
  if (!res.ok) {
    return {
      ok: false,
      options: [],
      error: res.error,
      debug: withOptionDebug(res.debug, [], res.error),
    }
  }
  const options = toOptions(
    asRecordArray(res.raw),
    ['userId', 'id', 'memberId'],
    ['name', 'userName', 'nickName'],
  )
  return { ok: true, options, debug: withOptionDebug(res.debug, options) }
}

export interface YunxiaoWorkItem {
  id: string
  subject: string
  category: string
  description?: string
  status?: string
}

/** List work items in a project; categories optional (Req/Bug/Task…), multi. */
export async function listYunxiaoWorkitems(
  endpoint: string,
  token: string,
  organizationId: string,
  spaceId: string,
  categories: string[] = ['Req', 'Bug', 'Task'],
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; items: YunxiaoWorkItem[]; error?: string }> {
  if (!token.trim()) return { ok: false, items: [], error: '请先填写访问令牌' }
  if (!organizationId.trim() || !spaceId.trim()) {
    return { ok: false, items: [], error: '请先选择企业和项目' }
  }
  const cats = (categories.length ? categories : ['Req', 'Bug', 'Task'])
    .map((c) => c.trim())
    .filter(Boolean)
  const org = encodeURIComponent(organizationId.trim())
  const items: YunxiaoWorkItem[] = []
  const seen = new Set<string>()
  let lastError = ''

  const ingest = (raw: unknown, fallbackCategory: string) => {
    for (const row of asRecordArray(raw)) {
      const id = String(row.id ?? row.identifier ?? row.workitemId ?? '').trim()
      if (!id || seen.has(id)) continue
      seen.add(id)
      const subject = String(row.subject ?? row.title ?? row.name ?? id).trim()
      const description = String(row.description ?? row.content ?? '').trim()
      const statusVal = row.status
      const status =
        typeof statusVal === 'string'
          ? statusVal
          : statusVal && typeof statusVal === 'object' && 'displayName' in statusVal
            ? String((statusVal as { displayName?: string }).displayName || '')
            : undefined
      items.push({
        id,
        subject,
        category: String(row.category ?? row.categoryId ?? fallbackCategory),
        description: description || undefined,
        status: status || undefined,
      })
    }
  }

  // Prefer one search with comma-separated categories (Yunxiao API).
  const joined = await yunxiaoRequest(
    endpoint,
    token,
    `/oapi/v1/projex/organizations/${org}/workitems:search`,
    {
      method: 'POST',
      body: JSON.stringify({
        category: cats.join(','),
        spaceId: spaceId.trim(),
        spaceType: 'Project',
        page: 1,
        perPage: 50,
        orderBy: 'gmtCreate',
        sort: 'desc',
      }),
    },
    fetchImpl,
  )
  if (joined.ok) {
    ingest(joined.raw, cats[0] || 'Req')
  } else {
    lastError = joined.error || ''
    for (const category of cats) {
      const res = await yunxiaoRequest(
        endpoint,
        token,
        `/oapi/v1/projex/organizations/${org}/workitems:search`,
        {
          method: 'POST',
          body: JSON.stringify({
            category,
            spaceId: spaceId.trim(),
            spaceType: 'Project',
            page: 1,
            perPage: 50,
            orderBy: 'gmtCreate',
            sort: 'desc',
          }),
        },
        fetchImpl,
      )
      if (!res.ok) {
        lastError = res.error || lastError
        continue
      }
      ingest(res.raw, category)
    }
  }

  if (!items.length) {
    return {
      ok: false,
      items: [],
      error: lastError || '未获取到工作项（请确认项目权限与类型筛选）',
    }
  }
  return { ok: true, items }
}

/** Create one 云效 work item (Bug) from failed checklist feedback. */
export async function createYunxiaoWorkitem(
  config: YunxiaoConfig,
  input: {
    subject: string
    description: string
    formatType?: 'MARKDOWN' | 'RICHTEXT'
  },
  fetchImpl: typeof fetch = fetch,
): Promise<YunxiaoCreateResult> {
  if (!isYunxiaoConfigReady(config)) {
    return { ok: false, error: '云效配置不完整（需要 token、企业、项目、缺陷类型、负责人）' }
  }
  const endpoint = normalizeYunxiaoEndpoint(config.endpoint)
  const url = `${endpoint}/oapi/v1/projex/organizations/${encodeURIComponent(config.organizationId.trim())}/workitems`
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: yunxiaoHeaders(config.token),
      body: JSON.stringify({
        subject: input.subject.slice(0, 200),
        description: input.description,
        formatType: input.formatType ?? 'MARKDOWN',
        spaceId: config.spaceId.trim(),
        workitemTypeId: config.workitemTypeId.trim(),
        assignedTo: config.assignedTo.trim(),
      }),
    })
    const text = await res.text()
    let raw: unknown = text
    try {
      raw = JSON.parse(text)
    } catch {
      /* keep text */
    }
    if (!res.ok) {
      const msg =
        typeof raw === 'object' && raw && 'errorMessage' in raw
          ? String((raw as { errorMessage?: string }).errorMessage)
          : typeof raw === 'object' && raw && 'message' in raw
            ? String((raw as { message?: string }).message)
            : text.slice(0, 400) || `HTTP ${res.status}`
      return { ok: false, error: msg, raw }
    }
    const obj = raw as Record<string, unknown>
    let workitemId = ''
    if (typeof obj.workitemId === 'string' || typeof obj.workitemId === 'number') {
      workitemId = String(obj.workitemId)
    } else if (typeof obj.id === 'string' || typeof obj.id === 'number') {
      workitemId = String(obj.id)
    } else if (typeof obj.identifier === 'string') {
      workitemId = obj.identifier
    } else if (obj.workitem && typeof obj.workitem === 'object') {
      const w = obj.workitem as { identifier?: string; id?: string | number }
      workitemId = String(w.identifier ?? w.id ?? '')
    }
    const webUrl =
      workitemId && config.organizationId
        ? `https://devops.aliyun.com/projex/project/${config.spaceId.trim()}/bug/${workitemId}`
        : undefined
    return { ok: true, workitemId: workitemId || undefined, url: webUrl, raw }
  } catch (error: unknown) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export interface YunxiaoAttachmentUploadResult {
  ok: boolean
  id?: string
  name?: string
  url?: string
  embedMarkdown?: string
  embedUrl?: string
  error?: string
  raw?: unknown
}

function safeUploadFilename(name: string): string {
  const base = (name || 'attachment').replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '_').trim()
  return (base || 'attachment').slice(0, 120)
}

/** Upload a file as a Yunxiao work-item attachment (multipart). */
export async function uploadYunxiaoWorkitemAttachment(
  config: YunxiaoConfig,
  workitemId: string,
  file: { name: string; mime?: string; data: Buffer },
  fetchImpl: typeof fetch = fetch,
): Promise<YunxiaoAttachmentUploadResult> {
  if (!config.token?.trim() || !config.organizationId?.trim()) {
    return { ok: false, error: '云效 token / 企业未配置' }
  }
  if (!workitemId.trim()) return { ok: false, error: '缺少工作项 id' }
  if (!file.data?.length) return { ok: false, error: '附件内容为空' }

  const endpoint = normalizeYunxiaoEndpoint(config.endpoint)
  const org = encodeURIComponent(config.organizationId.trim())
  const id = encodeURIComponent(workitemId.trim())
  const url = `${endpoint}/oapi/v1/projex/organizations/${org}/workitems/${id}/attachments`
  const filename = safeUploadFilename(file.name)
  const mime = (file.mime || 'application/octet-stream').trim() || 'application/octet-stream'

  try {
    const form = new FormData()
    // Node 20+ / undici: Blob + filename via File when available.
    const bytes = new Uint8Array(file.data)
    if (typeof File !== 'undefined') {
      form.append('file', new File([bytes], filename, { type: mime }))
    } else {
      form.append('file', new Blob([bytes], { type: mime }), filename)
    }

    const res = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'x-yunxiao-token': config.token.trim(),
      },
      body: form,
    })
    const text = await res.text()
    let raw: unknown = text
    try {
      raw = text ? JSON.parse(text) : null
    } catch {
      /* keep text */
    }
    if (!res.ok) {
      const msg =
        typeof raw === 'object' && raw && 'errorMessage' in raw
          ? String((raw as { errorMessage?: string }).errorMessage)
          : typeof raw === 'object' && raw && 'message' in raw
            ? String((raw as { message?: string }).message)
            : text.slice(0, 400) || `HTTP ${res.status}`
      return { ok: false, error: msg, raw }
    }
    const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
    return {
      ok: true,
      id: obj.id != null ? String(obj.id) : undefined,
      name: typeof obj.name === 'string' ? obj.name : filename,
      url: typeof obj.url === 'string' ? obj.url : undefined,
      embedMarkdown: typeof obj.embedMarkdown === 'string' ? obj.embedMarkdown : undefined,
      embedUrl: typeof obj.embedUrl === 'string' ? obj.embedUrl : undefined,
      raw,
    }
  } catch (error: unknown) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/** Rewrite Yunxiao embed markdown so the link text is the original filename. */
export function filenameEmbedMarkdown(
  filename: string,
  upload: { embedMarkdown?: string; embedUrl?: string },
): string | undefined {
  const label = (filename || 'image').replace(/[\[\]]/g, '')
  const embedUrl = upload.embedUrl?.trim()
  if (embedUrl) return `![${label}](${embedUrl})`
  const md = upload.embedMarkdown?.trim()
  if (!md) return undefined
  // Default API returns ![image](url) — swap alt text to filename.
  const m = /^!\[([^\]]*)\]\(([^)]+)\)\s*$/.exec(md)
  if (m) return `![${label}](${m[2]})`
  return md
}

/** Update a Yunxiao work item (e.g. description after embedding screenshots). */
export async function updateYunxiaoWorkitem(
  config: YunxiaoConfig,
  workitemId: string,
  fields: { description?: string; formatType?: 'MARKDOWN' | 'RICHTEXT'; subject?: string },
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; error?: string; raw?: unknown }> {
  if (!config.token?.trim() || !config.organizationId?.trim()) {
    return { ok: false, error: '云效 token / 企业未配置' }
  }
  if (!workitemId.trim()) return { ok: false, error: '缺少工作项 id' }
  const endpoint = normalizeYunxiaoEndpoint(config.endpoint)
  const org = encodeURIComponent(config.organizationId.trim())
  const id = encodeURIComponent(workitemId.trim())
  const url = `${endpoint}/oapi/v1/projex/organizations/${org}/workitems/${id}`
  const body: Record<string, string> = {}
  if (typeof fields.subject === 'string') body.subject = fields.subject
  if (typeof fields.description === 'string') {
    body.description = fields.description
    body.formatType = fields.formatType ?? 'MARKDOWN'
  }
  if (!Object.keys(body).length) return { ok: false, error: '没有可更新的字段' }

  try {
    const res = await fetchImpl(url, {
      method: 'PUT',
      headers: yunxiaoHeaders(config.token),
      body: JSON.stringify(body),
    })
    const text = await res.text()
    let raw: unknown = text
    try {
      raw = text ? JSON.parse(text) : null
    } catch {
      /* keep */
    }
    if (!res.ok) {
      const msg =
        typeof raw === 'object' && raw && 'errorMessage' in raw
          ? String((raw as { errorMessage?: string }).errorMessage)
          : typeof raw === 'object' && raw && 'message' in raw
            ? String((raw as { message?: string }).message)
            : text.slice(0, 400) || `HTTP ${res.status}`
      return { ok: false, error: msg, raw }
    }
    return { ok: true, raw }
  } catch (error: unknown) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
