/**
 * Android imperative View adapters (Java + Kotlin).
 *
 * Locates Activity / Fragment classes that build UI in code. Layout XML pages
 * remain on android-xml; @Composable files remain on android-compose.
 * Partial L1: static setText / colors / LayoutParams literals → DesignDoc.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { walkFiles } from '../fs-walk.js'
import { tokenizeName } from '../page-fingerprint.js'
import { countMatches, extractStringLiterals } from './source-text.js'
import { androidViewSourceToDesignDoc } from './imperative-design-doc.js'
import { loadNativeStyleContext } from './native-style-context.js'
import type {
  CodePage,
  PageFingerprint,
  PlatformAdapter,
} from './adapter-types.js'
import type { DesignDoc } from '../types.js'

const ACTIVITY_HINT =
  /(?:\bextends\b|:)\s*[\w.<>,\s]*\b(AppCompatActivity|Activity|FragmentActivity|Fragment|DialogFragment|BottomSheetDialogFragment)\b/
const VIEW_CONTROLS =
  /\b(new\s+)?(TextView|Button|ImageView|EditText|RecyclerView|LinearLayout|RelativeLayout|FrameLayout|ConstraintLayout|Toolbar|WebView)\b/g

function fingerprint(src: string, fileBase: string, ext: string): PageFingerprint {
  const base = fileBase.replace(new RegExp(`\\.${ext}$`, 'i'), '')
  const names = new Set<string>(tokenizeName(base))
  const classRe = /(?:class|object)\s+([A-Za-z0-9_]+)/g
  let cm: RegExpExecArray | null
  while ((cm = classRe.exec(src))) names.add((cm[1] ?? '').toLowerCase())

  return {
    texts: [...extractStringLiterals(src)],
    nameTokens: [...names].filter(Boolean),
    controlCount: countMatches(src, VIEW_CONTROLS),
  }
}

function makeAdapter(
  id: 'android-view-java' | 'android-view-kotlin',
  ext: 'java' | 'kt',
  kindLabel: string,
): PlatformAdapter {
  return {
    id,
    platform: 'android',
    kindLabel,
    precise: true,

    async discoverPages(root: string): Promise<CodePage[]> {
      const pages: CodePage[] = []
      await walkFiles(root, async (file) => {
        if (!file.name.toLowerCase().endsWith('.' + ext)) return
        let src = ''
        try {
          src = await readFile(file.absolutePath, 'utf8')
        } catch {
          return
        }
        if (ext === 'kt' && /@Composable\b/.test(src)) return
        if (!ACTIVITY_HINT.test(src)) return
        pages.push({
          adapterId: id,
          platform: 'android',
          kindLabel,
          relativePath: file.relativePath,
          absolutePath: file.absolutePath,
          precise: true,
          fingerprint: fingerprint(src, file.name, ext),
        })
      })
      return pages
    },

    async toDesignDoc(page: CodePage): Promise<DesignDoc> {
      const src = await readFile(page.absolutePath, 'utf8')
      const ctx = await loadNativeStyleContext(page.absolutePath, src, 'android-view')
      return androidViewSourceToDesignDoc(ctx.source, path.basename(page.relativePath))
    },
  }
}

export const androidViewJavaAdapter = makeAdapter(
  'android-view-java',
  'java',
  'Android Java View',
)

export const androidViewKotlinAdapter = makeAdapter(
  'android-view-kotlin',
  'kt',
  'Android Kotlin View',
)
