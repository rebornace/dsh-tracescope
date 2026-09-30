/**
 * Designer annotation filtering.
 *
 * IMPORTANT — counts are NOT annotations. On the 订阅粮坑 screen the card meta
 * row "#原创 | 图 1000 | 文 20 | 展品 500" is real UI: it is painted in Figma AND
 * rendered by the app's Adapter (`setText("图 " + picNum)`). An earlier version
 * of this filter removed those labels, which actually DELETED real UI and
 * created false "missing" diffs. Only obvious placeholder FILLER / design-spec
 * notes are treated as annotations.
 *
 * Detection is conservative so genuine UI copy is never pruned; users can still
 * dismiss remaining notes interactively on the compare board.
 */
import type { DesignDoc, DesignNode } from './types.js'

/**
 * Placeholder filler. Requires a content-indicator word AND a strong filler
 * signal (2+ repeated modal particles, or a particle run with trailing digits),
 * so genuine copy like "图 1000", "文 20", "跳过" is never touched.
 */
const CONTENT_INDICATOR = /(标题|正文|引言|文字|文案|占位|示例|placeholder|dummy|lorem)/i
const REPEATED_FILLER =
  /(啊{2,}|噢{2,}|哦{2,}|嗯{2,}|呀{2,}|哈{2,}|n{3,}|x{3,}|[啊噢哦嗯呀哈]{2,}\s*\d{0,4})/i
const PLACEHOLDER_MARKER =
  /^(占位|示例|此处|这里|placeholder|dummy|text\s*here|todo|tbd|lorem\s+ipsum)/i

/** Layer / group names that are almost always design-spec annotation containers. */
const ANNOTATION_NAME =
  /(备注|标注|注释|说明|切图|标注层|开发备注|辅助线|红线|尺寸标注|annotation|spec\b|guide\b|note\b|comment)/i

/** Measurement / callout copy typical of design redlines. */
const MEASUREMENT_TEXT =
  /^([←→↑↓]\s*)?\d+(\.\d+)?\s*(px|dp|pt)?$/i
const SPEC_PREFIX_TEXT =
  /^(宽|高|间距|边距|内边距|外边距|圆角|字号|字重|备注|标注|说明|注意|开发)[:：]/i

/** True when a piece of text is a designer placeholder note rather than UI copy. */
export function isDesignerAnnotationText(raw: string | undefined): boolean {
  if (!raw) return false
  const text = raw.replace(/\s+/g, ' ').trim()
  if (!text) return false

  if (PLACEHOLDER_MARKER.test(text)) return true
  if (CONTENT_INDICATOR.test(text) && REPEATED_FILLER.test(text)) return true
  if (SPEC_PREFIX_TEXT.test(text)) return true
  if (MEASUREMENT_TEXT.test(text)) return true

  return false
}

/**
 * True when a node (by name and/or text) is a designer annotation rather than
 * product UI. Groups named 备注/标注 are pruned wholesale.
 */
export function isDesignerAnnotationNode(node: DesignNode): boolean {
  const name = (node.name || '').trim()
  if (name && ANNOTATION_NAME.test(name)) return true
  if (node.kind === 'text' && isDesignerAnnotationText(node.text)) return true
  // Tiny measurement labels (common in redline layers) even without a keyword.
  if (
    node.kind === 'text' &&
    node.text &&
    typeof node.style.fontSize === 'number' &&
    node.style.fontSize <= 11 &&
    /^\d+(\.\d+)?/.test(node.text.trim())
  ) {
    return true
  }
  return false
}

/**
 * Recursively remove designer-annotation nodes from a design doc.
 * Prunes in place; returns the number of nodes removed.
 */
export function pruneDesignerAnnotations(doc: DesignDoc): number {
  let removed = 0
  const pruneChildren = (node: DesignNode): void => {
    const kept: DesignNode[] = []
    for (const child of node.children) {
      if (isDesignerAnnotationNode(child)) {
        removed += 1
        continue
      }
      pruneChildren(child)
      kept.push(child)
    }
    node.children = kept
  }
  // The root is the screen itself; never prune it even if its name matches.
  pruneChildren(doc.root)
  return removed
}
