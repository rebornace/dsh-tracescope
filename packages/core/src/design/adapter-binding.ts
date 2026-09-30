/**
 * Static "adapter → item layout" binding analysis for Android screens.
 *
 * A screen layout only declares a `RecyclerView`/`ViewPager` surface; the rows
 * are created at runtime by an Adapter that inflates another layout. This
 * module reads the Activity/Fragment and Adapter source (Java or Kotlin) and
 * recovers, for each dynamic surface, WHICH layout it inflates:
 *
 *   setContentView(R.layout.<entry>)            -> the host screen
 *   recycler.setAdapter(new Adapter())           host field -> adapter class
 *   Adapter.onCreateViewHolder inflate(R.layout.<item>)   adapter -> item
 *   Adapter extends RecyclerView.Adapter<VH>      -> view holder class
 *   holder.f.setAdapter(new InnerAdapter())       item field (id via VH) -> inner item
 *
 * The result maps: containing-layout name -> (dynamic region view id -> item
 * layout). Everything is heuristic and best-effort: an unresolvable surface is
 * simply omitted so callers can fall back to their placeholder.
 *
 * SCOPING — this is the crucial part. A real Android codebase has hundreds of
 * nested classes with the SAME simple name (`class Adapter`, `class VH`,
 * `class Holder`) in different files. Resolving a name against a single global
 * "simple name -> class" map lets the first file scanned hijack every later
 * file (e.g. this screen's rows silently became another screen's
 * `item_wannabuy_eventlist`). Resolution is therefore scope-aware:
 *
 *   - nested (inner) classes are visible ONLY inside their own file;
 *   - only top-level classes are reachable across files;
 *   - when resolving `new X()` / a variable `x` we first look in the current
 *     file's classes, then fall back to global top-level classes.
 */

export interface AdapterBindings {
  /** containing layout base name -> (dynamic region view id -> item layout) */
  layouts: Record<string, Record<string, string>>
}

type ClassKind = 'top' | 'nested'

interface ClassRecord {
  name: string
  kind: ClassKind
  file: string
  /** unique per-class token: file index + '#' + simple name */
  key: string
  headerStart: number
  bodyStart: number
  bodyEnd: number
  /** body up to the first nested class declaration */
  prefixEnd: number
  /** enclosing top-level class name (for nested classes) */
  enclosingTop?: string
  fieldToId: Record<string, string>
  vhGeneric?: string
  itemLayout?: string
  hostLayout?: string
  /** `holder.field.setAdapter(expr)` calls inside this class body */
  holderBinds: Array<{ field: string; expr: string }>
  /** bare `v.setAdapter(expr)` calls inside this class body */
  plainBinds: Array<{ v: string; expr: string }>
  assignNew: Record<string, string>
}

const CLASS_HEADER =
  /(?:\bclass|(?:public|private|protected|internal)\s+(?:static\s+)?(?:final\s+|abstract\s+|open\s+|sealed\s+)*class)\s+(\w+)/g

/** Find the matching closing brace for an opening brace at index `open`. */
function matchBrace(src: string, open: number): number {
  let depth = 0
  for (let i = open; i < src.length; i++) {
    const ch = src[i]
    if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return src.length - 1
}

/**
 * Determine which classes are top-level vs nested. A class is nested when its
 * declaration offset falls strictly inside an enclosing class's body. The
 * outermost class(es) of the file are "top".
 */
function classifyKinds(
  headers: Array<{ name: string; start: number; open: number }>,
  bodies: Array<{ start: number; end: number }>,
): ClassKind[] {
  return headers.map((h, i) => {
    for (let j = 0; j < bodies.length; j++) {
      if (j === i) continue
      // h is nested inside j when j's body wraps h's header.
      if (bodies[j]!.start < h.start && h.start < bodies[j]!.end) return 'nested'
    }
    return 'top'
  })
}

function buildClassRecords(file: string, fileIndex: number): ClassRecord[] {
  // Files are read by the caller; this helper receives content via closure map.
  const src = fileContentCache.get(file) ?? ''
  const headers: Array<{ name: string; start: number; open: number }> = []
  CLASS_HEADER.lastIndex = 0
  for (let m = CLASS_HEADER.exec(src); m; m = CLASS_HEADER.exec(src)) {
    const open = src.indexOf('{', m.index)
    if (open < 0) continue
    headers.push({ name: m[1]!, start: m.index, open })
  }
  if (!headers.length) return []

  const bodies = headers.map((h) => ({
    start: h.open + 1,
    end: matchBrace(src, h.open),
  }))
  const kinds = classifyKinds(headers, bodies)

  // Nearest enclosing top-level class for nested classes.
  const enclosingTopFor = (idx: number): string | undefined => {
    if (kinds[idx] === 'top') return undefined
    let best = -1
    for (let j = 0; j < bodies.length; j++) {
      if (j === idx || kinds[j] !== 'top') continue
      if (bodies[j]!.start < headers[idx]!.start && headers[idx]!.start < bodies[j]!.end) {
        if (best === -1 || bodies[j]!.start > bodies[best]!.start) best = j
      }
    }
    return best === -1 ? undefined : headers[best]!.name
  }

  const records: ClassRecord[] = []
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i]!
    const bodyStart = bodies[i]!.start
    const bodyEnd = bodies[i]!.end

    // Earliest nested class header strictly inside this body.
    let prefixEnd = bodyEnd
    for (let j = 0; j < headers.length; j++) {
      if (j === i) continue
      if (bodyStart < headers[j]!.start && headers[j]!.start < bodyEnd) {
        if (headers[j]!.start < prefixEnd) prefixEnd = headers[j]!.start
      }
    }
    const prefix = src.slice(bodyStart, prefixEnd)

    const fieldToId: Record<string, string> = {}
    // @BindView(R.id.x) Type field;
    const bindRe = /@BindView\(\s*R\.id\.(\w+)\s*\)[\s\S]{0,120}?\b(\w+)\s*[;=]/g
    for (const m of prefix.matchAll(bindRe)) fieldToId[m[2]!] = m[1]!
    // field = (cast) findViewById(R.id.x)  /  findViewById<Type>(R.id.x)
    // Accept an optional receiver (itemView.findViewById, v.findViewById, …).
    const findRe =
      /(\w+)\s*=\s*(?:\([^)]*\)\s*)?(?:[\w.]+\.)?findViewById(?:<[^>]*>)?\(\s*R\.id\.(\w+)\s*\)/g
    for (const m of prefix.matchAll(findRe)) fieldToId[m[1]!] = m[2]!

    const vhMatch = src
      .slice(h.start, bodyStart)
      .match(/Adapter\s*<\s*(\w+)\s*>/)
    const inflateMatch = prefix.match(/inflate\s*\(\s*R\.layout\.(\w+)/)
    const hostMatch = prefix.match(/setContentView\s*\(\s*R\.layout\.(\w+)/)

    const holderBinds: ClassRecord['holderBinds'] = []
    const plainBinds: ClassRecord['plainBinds'] = []
    const setRe = /(?:(\w+)\.(\w+)|(\w+))\s*\.\s*setAdapter\s*\(([^;)]*)\)/g
    for (const m of prefix.matchAll(setRe)) {
      if (m[1]) holderBinds.push({ field: m[2]!, expr: m[4]!.trim() })
      else plainBinds.push({ v: m[3]!, expr: m[4]!.trim() })
    }

    const assignNew: Record<string, string> = {}
    const assignRe = /(\w+)\s*=\s*new\s+(\w+)\s*\(/g
    for (const m of prefix.matchAll(assignRe)) assignNew[m[1]!] = m[2]!

    records.push({
      name: h.name,
      kind: kinds[i]!,
      file,
      key: `${fileIndex}#${h.name}`,
      headerStart: h.start,
      bodyStart,
      bodyEnd,
      prefixEnd,
      enclosingTop: enclosingTopFor(i),
      fieldToId,
      vhGeneric: vhMatch?.[1],
      itemLayout: inflateMatch?.[1],
      hostLayout: hostMatch?.[1],
      holderBinds,
      plainBinds,
      assignNew,
    })
  }
  return records
}

/** Per-build cache so {@link buildClassRecords} can read a file's content. */
const fileContentCache = new Map<string, string>()

interface Scope {
  /** all classes declared in the current file, by simple name */
  inFile: Map<string, ClassRecord>
  /** global top-level classes, by simple name */
  topLevel: Map<string, ClassRecord>
}

/**
 * Resolve a simple class name as seen from class `from`: prefer classes in the
 * same file (nested classes are visible there), then global top-level classes.
 */
function resolveClassName(name: string, from: ClassRecord, scope: Scope): ClassRecord | undefined {
  const local = scope.inFile.get(name)
  if (local) return local
  return scope.topLevel.get(name)
}

/** Resolve a setAdapter argument to an adapter class. */
function resolveAdapterExpr(
  expr: string,
  from: ClassRecord,
  scope: Scope,
): ClassRecord | undefined {
  const inline = expr.match(/^new\s+(\w+)\s*\(/)
  if (inline) return resolveClassName(inline[1]!, from, scope)
  const id = expr.match(/^(\w+)\s*$/)?.[1]
  if (id) {
    const clsName = from.assignNew[id]
    if (clsName) return resolveClassName(clsName, from, scope)
  }
  return undefined
}

/**
 * Analyse source files for the row bindings of one screen.
 *
 * @param entryLayout base name of the screen layout (e.g. "act_first_recommend_tag")
 * @param files source file contents (Java/Kotlin)
 */
export function analyzeAdapterBindings(
  entryLayout: string,
  files: Array<{ path: string; content: string }>,
): AdapterBindings {
  // Populate the content cache and build every class record.
  fileContentCache.clear()
  for (const f of files) fileContentCache.set(f.path, f.content)

  const allRecords: ClassRecord[] = []
  files.forEach((f, i) => {
    allRecords.push(...buildClassRecords(f.path, i))
  })

  // Global index of TOP-LEVEL classes only (first definition wins; prefer a
  // record that actually inflates an item layout, which is more informative).
  const topLevel = new Map<string, ClassRecord>()
  for (const rec of allRecords) {
    if (rec.kind !== 'top') continue
    const existing = topLevel.get(rec.name)
    if (!existing || (!existing.itemLayout && rec.itemLayout)) topLevel.set(rec.name, rec)
  }

  // Per-file class index (a file's nested + top classes, by simple name).
  const classesByFile = new Map<string, Map<string, ClassRecord>>()
  for (const rec of allRecords) {
    const map = classesByFile.get(rec.file) ?? new Map<string, ClassRecord>()
    const existing = map.get(rec.name)
    if (!existing || (!existing.itemLayout && rec.itemLayout)) map.set(rec.name, rec)
    classesByFile.set(rec.file, map)
  }

  const out: AdapterBindings = { layouts: {} }
  const addBinding = (containing: string, regionId: string, item: string): void => {
    if (!containing || !regionId || !item) return
    const bucket = out.layouts[containing] ?? {}
    bucket[regionId] = item
    out.layouts[containing] = bucket
  }

  for (const rec of allRecords) {
    const scope: Scope = {
      inFile: classesByFile.get(rec.file)!,
      topLevel,
    }

    // (1) Rows created by this adapter: an item-holder field whose inner
    // adapter inflates another layout. Attribute to THIS adapter's item.
    if (rec.itemLayout) {
      // The ViewHolder is a class in the same file whose simple name matches
      // the adapter's VH generic; fall back to same-file lookup by name.
      const vh = rec.vhGeneric
        ? resolveClassName(rec.vhGeneric, rec, scope)
        : undefined
      for (const b of rec.holderBinds) {
        const adapterRec = resolveAdapterExpr(b.expr, rec, scope)
        if (!adapterRec) continue
        const regionId =
          vh?.fieldToId[b.field] ?? rec.fieldToId[b.field] ?? b.field
        const innerItem = adapterRec.itemLayout
        if (innerItem) addBinding(rec.itemLayout, regionId, innerItem)
      }
    }

    // (2) Host screen: only a class that sets the content view to the ENTRY
    // layout contributes entry-level dynamic-surface bindings.
    if (rec.hostLayout === entryLayout) {
      for (const b of rec.plainBinds) {
        const regionId = rec.fieldToId[b.v]
        if (!regionId) continue
        const adapterRec = resolveAdapterExpr(b.expr, rec, scope)
        if (!adapterRec) continue
        const item = adapterRec.itemLayout
        if (item) addBinding(entryLayout, regionId, item)
      }
    }
  }

  return out
}
