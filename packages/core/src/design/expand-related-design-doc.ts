/**
 * Graft related-module DesignDocs onto an entry page tree so L1 exact compare
 * can see texts/controls that live in imported components / includes.
 *
 * Prefer replacing custom-component placeholder nodes (matched by tag/file
 * name). Unmatched modules still append under the entry root as a fallback.
 * Positions are not re-laid-out (static parsers have no real layout engine).
 */
import path from 'node:path'
import type { DesignDoc, DesignNode } from './types.js'

function toPosix(p: string): string {
  return p.replace(/\\/g, '/')
}

/** Normalize PayButton / pay-button / pay_button → paybutton for matching. */
export function normalizeComponentKey(name: string): string {
  return String(name || '')
    .replace(/\.[^.]+$/i, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[_\s]+/g, '-')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

export function moduleKeyFromPath(relativePath: string): string {
  const posix = toPosix(relativePath)
  const base = path.posix.basename(posix)
  const stem = base.replace(/\.[^.]+$/i, '')
  // components/badge/index.wxml → badge
  if (/^index$/i.test(stem)) {
    const parent = path.posix.basename(path.posix.dirname(posix))
    if (parent && parent !== '.' && parent !== '') return parent
  }
  return stem || base
}

function cloneNode(node: DesignNode, idPrefix: string): DesignNode {
  return {
    ...node,
    id: `${idPrefix}:${node.id}`,
    children: (node.children ?? []).map((c) => cloneNode(c, idPrefix)),
  }
}

function contentful(node: DesignNode): boolean {
  if (node.text && String(node.text).trim()) return true
  if (node.kind === 'image' || node.kind === 'icon') return true
  if (node.box.width != null || node.box.height != null) return true
  const style = node.style ?? {}
  if (
    style.backgroundColor ||
    style.color ||
    style.fontSize != null ||
    style.cornerRadius != null ||
    style.borderWidth != null
  ) {
    return true
  }
  return (node.children ?? []).some(contentful)
}

function moduleChildren(doc: DesignDoc, key: string): DesignNode[] {
  const root = doc.root
  if (!root) return []
  const idPrefix = `rel:${key}`
  const kids = (root.children ?? []).filter(contentful)
  if (kids.length) return kids.map((c) => cloneNode(c, idPrefix))
  if (!contentful(root)) return []
  return [
    cloneNode(
      {
        ...root,
        kind: root.kind === 'frame' ? 'view' : root.kind,
        name: root.name || key,
        children: [],
      },
      idPrefix,
    ),
  ]
}

function nodeMatchKeys(node: DesignNode): string[] {
  const keys: string[] = []
  const push = (raw: string | undefined) => {
    const k = normalizeComponentKey(raw || '')
    if (k && !keys.includes(k)) keys.push(k)
  }
  push(node.name)
  const cmp = String(node.id || '').match(/^cmp:([^:]+)/)
  if (cmp) push(cmp[1])
  return keys
}

/**
 * Extensions / paths that are worth running through an adapter's toDesignDoc.
 * Stylesheets and JSON config are already consumed as siblings by many adapters.
 */
export function isDesignDocCandidatePath(relativePath: string): boolean {
  const p = toPosix(relativePath).toLowerCase()
  if (/\.(css|scss|sass|less|wxss|acss|ttss|json|md|txt|png|jpg|jpeg|webp|gif|svg)$/i.test(p)) {
    return false
  }
  // Bare Page({}) / Component({}) JS without markup usually has no UI tree.
  if (/\.(js|mjs|cjs)$/i.test(p) && !/\.(tsx|jsx)$/i.test(p)) return false
  return true
}

export interface RelatedDesignDocInput {
  relativePath: string
  doc: DesignDoc
}

type ModuleEntry = { key: string; norm: string; children: DesignNode[] }

function buildModules(related: RelatedDesignDocInput[]): ModuleEntry[] {
  const out: ModuleEntry[] = []
  const seen = new Set<string>()
  for (const item of related) {
    const key = moduleKeyFromPath(item.relativePath)
    const norm = normalizeComponentKey(key)
    if (!key || !norm || seen.has(norm)) continue
    const children = moduleChildren(item.doc, key)
    if (!children.length) continue
    seen.add(norm)
    out.push({ key, norm, children })
  }
  return out
}

function replacePlaceholders(
  node: DesignNode,
  modules: ModuleEntry[],
  used: Set<string>,
): DesignNode {
  const keys = nodeMatchKeys(node)
  for (const k of keys) {
    const mod = modules.find((m) => m.norm === k)
    if (!mod || used.has(mod.norm)) continue
    used.add(mod.norm)
    return {
      ...node,
      id: `rel:${mod.key}:host`,
      kind: 'view',
      // Keep host name as the component tag; body comes from the module.
      children: mod.children,
    }
  }
  return {
    ...node,
    children: (node.children ?? []).map((c) => replacePlaceholders(c, modules, used)),
  }
}

/**
 * Return a new DesignDoc with related modules inlined into matching component
 * placeholders; leftover modules are appended under the entry root.
 */
export function expandDesignDocWithRelated(
  entry: DesignDoc,
  related: RelatedDesignDocInput[],
): DesignDoc {
  if (!related.length) return entry

  const modules = buildModules(related)
  if (!modules.length) return entry

  const used = new Set<string>()
  const newRoot = replacePlaceholders(entry.root, modules, used)

  const leftover: DesignNode[] = []
  for (const mod of modules) {
    if (used.has(mod.norm)) continue
    leftover.push(...mod.children)
  }

  return {
    ...entry,
    root: {
      ...newRoot,
      children: [...(newRoot.children ?? []), ...leftover],
    },
  }
}
