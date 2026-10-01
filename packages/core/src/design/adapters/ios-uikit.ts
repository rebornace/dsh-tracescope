/**
 * iOS UIKit pure-code adapters (Objective-C + Swift).
 *
 * Xib/Storyboard stay on ios-xib; SwiftUI View structs stay on ios-swiftui.
 * Partial L1: static text / colors / CGRect / cornerRadius → DesignDoc.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { walkFiles } from '../fs-walk.js'
import { tokenizeName } from '../page-fingerprint.js'
import { countMatches, extractStringLiterals } from './source-text.js'
import { uikitSourceToDesignDoc } from './imperative-design-doc.js'
import { loadNativeStyleContext } from './native-style-context.js'
import type {
  CodePage,
  PageFingerprint,
  PlatformAdapter,
} from './adapter-types.js'
import type { DesignDoc } from '../types.js'

const OBJC_VC =
  /@interface\s+\w+[\s\S]{0,80}:\s*[\w\s]*UIViewController\b|@implementation\s+\w+ViewController\b/
const SWIFT_VC =
  /class\s+[A-Za-z0-9_]+\s*:\s*[^{]*\bUIViewController\b/
const SWIFTUI_VIEW = /struct\s+[A-Za-z0-9_]+\s*:[^\{]*\bView\b/
const UIKIT_CONTROLS =
  /\b(UILabel|UIButton|UIImageView|UITextField|UITextView|UITableView|UICollectionView|UIStackView|UIScrollView|UISwitch|UISlider)\b/g

function fingerprintObjc(src: string, fileBase: string): PageFingerprint {
  const base = fileBase.replace(/\.(m|mm)$/i, '')
  const names = new Set<string>(tokenizeName(base))
  const iface = /@interface\s+([A-Za-z0-9_]+)/g
  let m: RegExpExecArray | null
  while ((m = iface.exec(src))) names.add((m[1] ?? '').toLowerCase())
  return {
    texts: [...extractStringLiterals(src)],
    nameTokens: [...names].filter(Boolean),
    controlCount: countMatches(src, UIKIT_CONTROLS),
  }
}

function fingerprintSwift(src: string, fileBase: string): PageFingerprint {
  const base = fileBase.replace(/\.swift$/i, '')
  const names = new Set<string>(tokenizeName(base))
  const classRe = /class\s+([A-Za-z0-9_]+)/g
  let m: RegExpExecArray | null
  while ((m = classRe.exec(src))) names.add((m[1] ?? '').toLowerCase())
  return {
    texts: [...extractStringLiterals(src)],
    nameTokens: [...names].filter(Boolean),
    controlCount: countMatches(src, UIKIT_CONTROLS),
  }
}

export const iosUikitObjcAdapter: PlatformAdapter = {
  id: 'ios-uikit-objc',
  platform: 'ios',
  kindLabel: 'iOS UIKit (ObjC)',
  precise: true,

  async discoverPages(root: string): Promise<CodePage[]> {
    const pages: CodePage[] = []
    await walkFiles(root, async (file) => {
      if (!/\.(m|mm)$/i.test(file.name)) return
      let src = ''
      try {
        src = await readFile(file.absolutePath, 'utf8')
      } catch {
        return
      }
      if (!OBJC_VC.test(src)) return
      const controlHits = countMatches(src, UIKIT_CONTROLS)
      if (controlHits < 1 && !/ViewController/i.test(file.name)) return
      pages.push({
        adapterId: 'ios-uikit-objc',
        platform: 'ios',
        kindLabel: 'iOS UIKit (ObjC)',
        relativePath: file.relativePath,
        absolutePath: file.absolutePath,
        precise: true,
        fingerprint: fingerprintObjc(src, file.name),
      })
    })
    return pages
  },

  async toDesignDoc(page: CodePage): Promise<DesignDoc> {
    const src = await readFile(page.absolutePath, 'utf8')
    const ctx = await loadNativeStyleContext(page.absolutePath, src, 'swiftui')
    return uikitSourceToDesignDoc(ctx.source, path.basename(page.relativePath))
  },
}

export const iosUikitSwiftAdapter: PlatformAdapter = {
  id: 'ios-uikit-swift',
  platform: 'ios',
  kindLabel: 'iOS UIKit (Swift)',
  precise: true,

  async discoverPages(root: string): Promise<CodePage[]> {
    const pages: CodePage[] = []
    await walkFiles(root, async (file) => {
      if (!file.name.endsWith('.swift')) return
      let src = ''
      try {
        src = await readFile(file.absolutePath, 'utf8')
      } catch {
        return
      }
      if (SWIFTUI_VIEW.test(src) && !SWIFT_VC.test(src)) return
      if (!SWIFT_VC.test(src)) return
      pages.push({
        adapterId: 'ios-uikit-swift',
        platform: 'ios',
        kindLabel: 'iOS UIKit (Swift)',
        relativePath: file.relativePath,
        absolutePath: file.absolutePath,
        precise: true,
        fingerprint: fingerprintSwift(src, file.name),
      })
    })
    return pages
  },

  async toDesignDoc(page: CodePage): Promise<DesignDoc> {
    const src = await readFile(page.absolutePath, 'utf8')
    const ctx = await loadNativeStyleContext(page.absolutePath, src, 'swiftui')
    return uikitSourceToDesignDoc(ctx.source, path.basename(page.relativePath))
  },
}
