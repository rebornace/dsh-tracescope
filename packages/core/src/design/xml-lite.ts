/**
 * Minimal, zero-dependency XML tokeniser for Android resource / layout files.
 * Only handles the well-formed subset Android emits (elements, attributes,
 * text, comments); it is not a general XML engine.
 */

export interface XmlElement {
  tag: string
  attrs: Record<string, string>
  children: XmlElement[]
  text: string
}

class XmlScanner {
  private pos = 0

  constructor(private readonly src: string) {}

  parse(): XmlElement {
    // Skip prolog / comments / doctype before the root.
    let node = this.nextNode()
    while (node && node.tag === '') {
      node = this.nextNode()
    }
    if (!node) throw new Error('XML 中找不到根元素')
    return node
  }

  private skipDecl(): void {
    // Called when current char starts `<` for comments / declarations.
  }

  private nextNode(): XmlElement | null {
    // Advance to next '<'
    while (this.pos < this.src.length && this.src[this.pos] !== '<') this.pos++
    if (this.pos >= this.src.length) return null

    if (this.src.startsWith('<!--', this.pos)) {
      const end = this.src.indexOf('-->', this.pos + 4)
      this.pos = end < 0 ? this.src.length : end + 3
      return { tag: '', attrs: {}, children: [], text: '' }
    }
    if (this.src.startsWith('<?', this.pos) || this.src.startsWith('<!', this.pos)) {
      const end = this.src.indexOf('>', this.pos)
      this.pos = end < 0 ? this.src.length : end + 1
      return { tag: '', attrs: {}, children: [], text: '' }
    }

    const tagStart = this.pos + 1
    let p = tagStart
    while (p < this.src.length && !/[\s/>]/.test(this.src[p] ?? '')) p++
    const tag = this.src.slice(tagStart, p).toLowerCase()
    const attrs: Record<string, string> = {}

    let selfClosing = false
    // Parse attributes until '>' or '/>'
    for (;;) {
      while (p < this.src.length && /\s/.test(this.src[p] ?? '')) p++
      if (this.src[p] === '/') {
        selfClosing = true
        p++
        while (p < this.src.length && this.src[p] !== '>') p++
        p++ // consume '>'
        this.pos = p
        return { tag, attrs, children: [], text: '' }
      }
      if (this.src[p] === '>') {
        p++
        break
      }
      // attribute name
      const nameStart = p
      while (p < this.src.length && /[^\s=/>]/.test(this.src[p] ?? '')) p++
      const name = this.src.slice(nameStart, p)
      while (p < this.src.length && /\s/.test(this.src[p] ?? '')) p++
      let value = ''
      if (this.src[p] === '=') {
        p++
        while (p < this.src.length && /\s/.test(this.src[p] ?? '')) p++
        const quote = this.src[p]
        if (quote === '"' || quote === "'") {
          p++
          const valStart = p
          while (p < this.src.length && this.src[p] !== quote) p++
          value = decodeXmlEntities(this.src.slice(valStart, p))
          p++ // closing quote
        }
      }
      if (name) attrs[name] = value
    }

    // Children + text until matching close tag.
    const children: XmlElement[] = []
    let text = ''
    const textStart = p
    for (;;) {
      const nextLt = this.src.indexOf('<', p)
      if (nextLt < 0) {
        text += this.src.slice(p)
        p = this.src.length
        break
      }
      if (this.src.startsWith('<!--', nextLt)) {
        text += this.src.slice(p, nextLt)
        const end = this.src.indexOf('-->', nextLt + 4)
        p = end < 0 ? this.src.length : end + 3
        continue
      }
      if (this.src.startsWith('</', nextLt)) {
        text += this.src.slice(p, nextLt)
        const gt = this.src.indexOf('>', nextLt)
        this.pos = gt + 1
        return { tag, attrs, children, text: decodeXmlEntities(text.trim()) }
      }
      // Child element.
      text += this.src.slice(p, nextLt)
      this.pos = nextLt
      const child = this.nextNode()
      p = this.pos
      if (child) {
        if (child.tag) children.push(child)
      }
    }
    void textStart
    this.pos = p
    return { tag, attrs, children, text: decodeXmlEntities(text.trim()) }
  }
}

export function parseXml(src: string): XmlElement {
  return new XmlScanner(src).parse()
}

export function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, code) => String.fromCodePoint(Number(code)))
    .replace(/&x([0-9a-f]+);/gi, (_m, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, '&')
}
