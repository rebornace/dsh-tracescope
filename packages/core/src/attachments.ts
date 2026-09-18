import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, readFile, rm, unlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { ReportAttachment } from './types.js'

export const MAX_REPORT_ATTACHMENTS = 8
/** Base64 JSON upload soft cap (~40MB decoded). */
export const MAX_ATTACHMENT_UPLOAD_BYTES = 40 * 1024 * 1024
/** Local-path copy cap for large videos/docs. */
export const MAX_ATTACHMENT_LOCAL_BYTES = 200 * 1024 * 1024

function tracescopeRoot(cacheRoot?: string): string {
  return cacheRoot ?? path.join(os.homedir(), '.tracescope')
}

export function reportAttachmentsDir(reportKey: string, cacheRoot?: string): string {
  return path.join(tracescopeRoot(cacheRoot), 'attachments', reportKey)
}

function safeStoredName(id: string, originalName: string): string {
  const ext = path.extname(originalName || '').slice(0, 16).replace(/[^\w.-]/g, '')
  return `${id}${ext || ''}`
}

function guessMime(name: string, fallback?: string): string {
  if (fallback && fallback.trim()) return fallback.trim()
  const ext = path.extname(name).toLowerCase()
  switch (ext) {
    case '.mp4':
      return 'video/mp4'
    case '.webm':
      return 'video/webm'
    case '.mov':
      return 'video/quicktime'
    case '.mkv':
      return 'video/x-matroska'
    case '.pdf':
      return 'application/pdf'
    case '.doc':
      return 'application/msword'
    case '.docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    case '.xls':
      return 'application/vnd.ms-excel'
    case '.xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    case '.ppt':
      return 'application/vnd.ms-powerpoint'
    case '.pptx':
      return 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    case '.txt':
      return 'text/plain'
    case '.md':
      return 'text/markdown'
    case '.zip':
      return 'application/zip'
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.gif':
      return 'image/gif'
    case '.webp':
      return 'image/webp'
    default:
      return 'application/octet-stream'
  }
}

/** Normalize attachment metadata persisted on an ImpactReport. */
export function normalizeReportAttachments(raw: unknown): ReportAttachment[] {
  if (!Array.isArray(raw)) return []
  const out: ReportAttachment[] = []
  const seen = new Set<string>()
  for (const row of raw) {
    if (out.length >= MAX_REPORT_ATTACHMENTS) break
    if (!row || typeof row !== 'object') continue
    const o = row as Record<string, unknown>
    const id = String(o.id ?? '').trim()
    const name = String(o.name ?? '').trim()
    const storedName = String(o.storedName ?? '').trim()
    if (!id || !name || !storedName || seen.has(id)) continue
    if (storedName.includes('..') || storedName.includes('/') || storedName.includes('\\')) continue
    seen.add(id)
    const size = typeof o.size === 'number' && Number.isFinite(o.size) ? Math.max(0, o.size) : 0
    out.push({
      id,
      name: name.slice(0, 200),
      mime: guessMime(name, typeof o.mime === 'string' ? o.mime : undefined),
      size,
      storedName,
      addedAt:
        typeof o.addedAt === 'string' && o.addedAt.trim()
          ? o.addedAt
          : new Date().toISOString(),
    })
  }
  return out
}

export async function removeReportAttachmentsDir(
  reportKey: string,
  cacheRoot?: string,
): Promise<void> {
  const dir = reportAttachmentsDir(reportKey, cacheRoot)
  try {
    await rm(dir, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
}

export async function deleteReportAttachmentFile(
  reportKey: string,
  storedName: string,
  cacheRoot?: string,
): Promise<void> {
  if (!storedName || storedName.includes('..') || storedName.includes('/') || storedName.includes('\\')) {
    return
  }
  try {
    await unlink(path.join(reportAttachmentsDir(reportKey, cacheRoot), storedName))
  } catch {
    /* ignore */
  }
}

async function writeAttachmentMeta(input: {
  reportKey: string
  name: string
  mime?: string
  size: number
  cacheRoot?: string
  write: (filePath: string) => Promise<void>
}): Promise<ReportAttachment> {
  const id = randomUUID()
  const storedName = safeStoredName(id, input.name)
  const dir = reportAttachmentsDir(input.reportKey, input.cacheRoot)
  await mkdir(dir, { recursive: true })
  await input.write(path.join(dir, storedName))
  return {
    id,
    name: input.name.slice(0, 200) || storedName,
    mime: guessMime(input.name, input.mime),
    size: input.size,
    storedName,
    addedAt: new Date().toISOString(),
  }
}

/** Persist a binary buffer as a report-level attachment. */
export async function saveReportAttachmentBuffer(input: {
  reportKey: string
  name: string
  mime?: string
  data: Buffer
  cacheRoot?: string
  maxBytes?: number
}): Promise<ReportAttachment> {
  const max = input.maxBytes ?? MAX_ATTACHMENT_UPLOAD_BYTES
  if (input.data.length > max) {
    throw new Error(`附件过大（上限 ${Math.round(max / (1024 * 1024))}MB）`)
  }
  return writeAttachmentMeta({
    reportKey: input.reportKey,
    name: input.name,
    mime: input.mime,
    size: input.data.length,
    cacheRoot: input.cacheRoot,
    write: async (filePath) => {
      await writeFile(filePath, input.data)
    },
  })
}

/** Copy a local absolute path into the report attachment store. */
export async function saveReportAttachmentFromLocalPath(input: {
  reportKey: string
  localPath: string
  name?: string
  mime?: string
  cacheRoot?: string
}): Promise<ReportAttachment> {
  const localPath = path.resolve(input.localPath.trim())
  const name = (input.name || path.basename(localPath) || 'attachment').slice(0, 200)
  const data = await readFile(localPath)
  if (data.length > MAX_ATTACHMENT_LOCAL_BYTES) {
    throw new Error(
      `附件过大（本机复制上限 ${Math.round(MAX_ATTACHMENT_LOCAL_BYTES / (1024 * 1024))}MB）`,
    )
  }
  return writeAttachmentMeta({
    reportKey: input.reportKey,
    name,
    mime: input.mime,
    size: data.length,
    cacheRoot: input.cacheRoot,
    write: async (filePath) => {
      try {
        await copyFile(localPath, filePath)
      } catch {
        await writeFile(filePath, data)
      }
    },
  })
}

export async function readReportAttachmentFile(input: {
  reportKey: string
  storedName: string
  cacheRoot?: string
}): Promise<Buffer> {
  const storedName = input.storedName
  if (!storedName || storedName.includes('..') || storedName.includes('/') || storedName.includes('\\')) {
    throw new Error('非法附件名')
  }
  return readFile(path.join(reportAttachmentsDir(input.reportKey, input.cacheRoot), storedName))
}

export function formatAttachmentSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
