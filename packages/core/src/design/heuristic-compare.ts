/**
 * L2 heuristic static compare for locator-only adapters.
 *
 * Produces DesignDiff / unmatched entries without a full geometry tree:
 * missing design texts, control-count skew. Deterministic — no model.
 */
import type { DesignDoc, DesignDiff, DesignNode, UnmatchedNode, VisualCompareResult } from './types.js'
import type { AdapterId, CodePage } from './adapters/adapter-types.js'
import { normalizeText } from './page-fingerprint.js'
import { countMatches, extractUiTexts } from './adapters/source-text.js'
import { readFile } from 'node:fs/promises'

const CONTROL_PATTERNS: Partial<Record<AdapterId, RegExp>> = {
  'android-compose':
    /\b(Text|Button|Image|Icon|Spacer|Box|Column|Row|Scaffold|LazyColumn|LazyRow|Card|TopAppBar)\s*\(/g,
  'ios-swiftui':
    /\b(Text|Button|Image|Label|Spacer|VStack|HStack|ZStack|List|ScrollView|NavigationStack|Form|Rectangle|Circle)\s*[(\s]/g,
  'android-view-java':
    /\b(TextView|Button|ImageView|EditText|RecyclerView|LinearLayout|RelativeLayout|FrameLayout|ConstraintLayout|Toolbar|WebView)\b/g,
  'android-view-kotlin':
    /\b(TextView|Button|ImageView|EditText|RecyclerView|LinearLayout|RelativeLayout|FrameLayout|ConstraintLayout|Toolbar|WebView)\b/g,
  'ios-uikit-objc':
    /\b(UILabel|UIButton|UIImageView|UITextField|UITextView|UITableView|UICollectionView|UIStackView|UIScrollView)\b/g,
  'ios-uikit-swift':
    /\b(UILabel|UIButton|UIImageView|UITextField|UITextView|UITableView|UICollectionView|UIStackView|UIScrollView)\b/g,
  flutter:
    /\b(Text|ElevatedButton|TextButton|IconButton|Image|Icon|Container|Column|Row|ListView|GridView|Scaffold|AppBar|Card)\s*[\.(]/g,
  'react-native':
    /\b(View|Text|Image|ScrollView|FlatList|TouchableOpacity|Pressable|TextInput|Button|SafeAreaView)\b/g,
  'harmony-arkui':
    /\b(Text|Button|Image|Column|Row|Stack|List|Grid|Scroll|TextInput|Tabs|Swiper)\s*[\.(]/g,
  'web-html':
    /<(button|input|img|a|select|textarea|ul|li|nav|header|footer|form|h[1-6]|p)\b/gi,
  'web-vue':
    /<(button|input|img|a|select|textarea|ul|li|nav|header|footer|form|h[1-6]|p)\b/gi,
  'web-react':
    /\b(div|span|button|img|input|a|section|header|footer|nav|main|ul|li|form|h[1-6]|p)\b/gi,
  'web-svelte':
    /<(button|input|img|a|select|textarea|ul|li|nav|header|footer|form|h[1-6]|p)\b/gi,
  'web-angular':
    /<(button|input|img|a|select|textarea|ul|li|nav|header|footer|form|h[1-6]|p)\b/gi,
  'miniprogram-wxml':
    /<(view|text|button|image|navigator|input|scroll-view|swiper)\b/gi,
  'miniprogram-axml':
    /<(view|text|button|image|navigator|input|scroll-view|swiper)\b/gi,
  'miniprogram-ttml':
    /<(view|text|button|image|navigator|input|scroll-view|swiper)\b/gi,
  'miniprogram-swan':
    /<(view|text|button|image|navigator|input|scroll-view|swiper)\b/gi,
  'uni-app':
    /<(view|text|button|image|navigator|input|scroll-view|swiper|div|span|h[1-6]|p)\b/gi,
  taro:
    /\b(View|Text|Image|Button|ScrollView|Input|div|span|button|img|h[1-6]|p)\b/g,
  'maui-xaml':
    /<(Label|Button|Entry|Image|Frame|Grid|StackLayout|VerticalStackLayout|HorizontalStackLayout)\b/gi,
}

function collectTextNodes(node: DesignNode, out: DesignNode[] = []): DesignNode[] {
  if (node.kind === 'text' && node.text && normalizeText(node.text)) {
    out.push(node)
  }
  for (const child of node.children) collectTextNodes(child, out)
  return out
}

function countDesignControls(node: DesignNode): number {
  let n = 0
  for (const child of node.children) {
    if (child.kind !== 'group') n += 1
    n += countDesignControls(child)
  }
  return n
}

function countControlSites(src: string, adapterId: AdapterId): number {
  const re = CONTROL_PATTERNS[adapterId]
  if (!re) return 0
  return countMatches(src, re)
}

/**
 * Heuristic compare: design texts vs source string literals, plus control-count.
 */
export async function heuristicCompare(
  design: DesignDoc,
  page: CodePage,
): Promise<VisualCompareResult> {
  let src = ''
  try {
    src = await readFile(page.absolutePath, 'utf8')
  } catch {
    return {
      diffs: [],
      unmatched: [
        {
          id: page.relativePath,
          name: page.relativePath,
          side: 'code',
          text: '无法读取源码文件',
        },
      ],
      comparedPairs: 0,
    }
  }

  const literals = extractUiTexts(src)
  const textNodes = collectTextNodes(design.root)
  const diffs: DesignDiff[] = []
  const unmatched: UnmatchedNode[] = []
  let hit = 0

  for (const node of textNodes) {
    const nt = normalizeText(node.text)
    if (!nt) continue
    if (literals.has(nt)) {
      hit += 1
      continue
    }
    let found = false
    for (const lit of literals) {
      if (lit.includes(nt) || nt.includes(lit)) {
        found = true
        break
      }
    }
    if (found) {
      hit += 1
      continue
    }
    diffs.push({
      designNodeId: node.id,
      nodeName: node.name || node.text || 'text',
      property: 'text',
      expected: node.text ?? '',
      actual: '（代码字面量中未找到）',
      severity: 'high',
    })
    unmatched.push({
      id: node.id,
      name: node.name,
      side: 'design',
      text: node.text,
    })
  }

  const designControls = countDesignControls(design.root)
  const codeControls = countControlSites(src, page.adapterId) || page.fingerprint.controlCount
  if (designControls > 0 && codeControls > 0) {
    const ratio = Math.abs(designControls - codeControls) / Math.max(designControls, codeControls)
    if (ratio >= 0.45) {
      diffs.push({
        designNodeId: design.root.id,
        nodeName: design.root.name || 'screen',
        property: 'controlCount',
        expected: designControls,
        actual: codeControls,
        severity: ratio >= 0.7 ? 'medium' : 'low',
        needsReview: true,
      })
    }
  }

  return {
    diffs,
    unmatched,
    comparedPairs: hit,
  }
}
