/**
 * Load companion style/theme sources for native & declarative clients, then
 * rewrite symbol colour references into hex literals the shallow parsers understand.
 */
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

export type NativeStyleKind =
  | 'rn'
  | 'flutter'
  | 'compose'
  | 'swiftui'
  | 'android-view'
  | 'maui'
  | 'arkui'

async function readMaybe(abs: string): Promise<string> {
  try {
    return await readFile(abs, 'utf8')
  } catch {
    return ''
  }
}

function uniqPush(arr: string[], v: string): void {
  if (v && !arr.includes(v)) arr.push(v)
}

function hexFromArgbToken(token: string): string | undefined {
  const m = token.match(/0x([0-9A-Fa-f]{6,8})/i) ?? token.match(/#([0-9A-Fa-f]{6,8})/)
  if (!m) return undefined
  const h = m[1]!
  if (h.length === 8) {
    // AARRGGBB → #RRGGBBAA
    return `#${h.slice(2)}${h.slice(0, 2)}`.toLowerCase()
  }
  if (h.length === 6) return `#${h}`.toLowerCase()
  if (h.length === 3) {
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toLowerCase()
  }
  return undefined
}

/** Collect colour constants from a blob of source / XML / Dart / Kotlin / Swift. */
export function extractColorSymbols(text: string): Map<string, string> {
  const out = new Map<string, string>()
  const set = (name: string | undefined, hex: string | undefined) => {
    if (!name || !hex) return
    out.set(name, hex)
    // Also index unqualified leaf for Foo.bar → bar
    const leaf = name.includes('.') ? name.split('.').pop() : name
    if (leaf && !out.has(leaf)) out.set(leaf, hex)
  }

  // Dart / Flutter: static const primary = Color(0xFF112233);
  for (const m of text.matchAll(
    /(?:static\s+)?(?:const\s+)?(?:Color\s+)?(\w+)\s*=\s*const\s*Color\s*\(\s*(0x[0-9A-Fa-f]{6,8})\s*\)/g,
  )) {
    set(m[1], hexFromArgbToken(m[2] ?? ''))
  }
  for (const m of text.matchAll(
    /(?:static\s+)?(?:const\s+)?(?:Color\s+)?(\w+)\s*=\s*Color\s*\(\s*(0x[0-9A-Fa-f]{6,8})\s*\)/g,
  )) {
    set(m[1], hexFromArgbToken(m[2] ?? ''))
  }
  // class AppColors { static const primary = Color(0x..) }
  for (const m of text.matchAll(
    /(?:class|mixin)\s+(\w+)\b[\s\S]{0,4000}?\}/g,
  )) {
    const className = m[1] ?? ''
    const body = m[0]
    for (const cm of body.matchAll(
      /(?:static\s+)?(?:const\s+)?(?:Color\s+)?(\w+)\s*=\s*(?:const\s*)?Color\s*\(\s*(0x[0-9A-Fa-f]{6,8})\s*\)/g,
    )) {
      set(`${className}.${cm[1]}`, hexFromArgbToken(cm[2] ?? ''))
      set(cm[1], hexFromArgbToken(cm[2] ?? ''))
    }
  }

  // Kotlin / Compose: val Primary = Color(0xFF112233) / Color(0xFF112233)
  for (const m of text.matchAll(
    /(?:val|const\s+val|fun)\s+(\w+)\s*(?::\s*Color)?\s*=\s*Color\s*\(\s*(0x[0-9A-Fa-f]{6,8})\s*\)/g,
  )) {
    set(m[1], hexFromArgbToken(m[2] ?? ''))
  }
  for (const m of text.matchAll(
    /object\s+(\w+)\s*\{([\s\S]*?)\}/g,
  )) {
    const obj = m[1] ?? ''
    for (const cm of (m[2] ?? '').matchAll(
      /(?:val|const\s+val)\s+(\w+)\s*(?::\s*Color)?\s*=\s*Color\s*\(\s*(0x[0-9A-Fa-f]{6,8})\s*\)/g,
    )) {
      set(`${obj}.${cm[1]}`, hexFromArgbToken(cm[2] ?? ''))
      set(cm[1], hexFromArgbToken(cm[2] ?? ''))
    }
  }

  // Swift: static let primary = Color(hex: "#112233") / UIColor(hex:)
  for (const m of text.matchAll(
    /(?:static\s+)?(?:let|var)\s+(\w+)\s*[:=].*?(?:Color|UIColor)\s*\([^\)]*(?:hex\s*:\s*)?["'](#[0-9A-Fa-f]{3,8})["']/g,
  )) {
    set(m[1], hexFromArgbToken(m[2] ?? ''))
  }
  for (const m of text.matchAll(
    /(?:static\s+)?(?:let|var)\s+(\w+)\s*=\s*Color\s*\(\s*red:[^)]+\)/g,
  )) {
    /* skip complex */
    void m
  }

  // RN / JS: export const colors = { primary: '#112233' } / primary: '#112233'
  for (const m of text.matchAll(
    /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*\{([\s\S]*?)\}/g,
  )) {
    const obj = m[1] ?? ''
    if (!obj || /^(if|for|while|switch|function)$/.test(obj)) continue
    for (const cm of (m[2] ?? '').matchAll(/(\w+)\s*:\s*['"](#[0-9A-Fa-f]{3,8})['"]/g)) {
      set(`${obj}.${cm[1]}`, hexFromArgbToken(cm[2] ?? ''))
      set(cm[1], hexFromArgbToken(cm[2] ?? ''))
    }
  }
  // theme = { colors: { primary: '#112233' } }
  for (const m of text.matchAll(
    /(?:colors|Colors)\s*:\s*\{([\s\S]*?)\}/g,
  )) {
    for (const cm of (m[1] ?? '').matchAll(/(\w+)\s*:\s*['"](#[0-9A-Fa-f]{3,8})['"]/g)) {
      set(`theme.colors.${cm[1]}`, hexFromArgbToken(cm[2] ?? ''))
      set(`colors.${cm[1]}`, hexFromArgbToken(cm[2] ?? ''))
      set(cm[1]!, hexFromArgbToken(cm[2] ?? ''))
    }
  }
  for (const m of text.matchAll(
    /(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*['"](#[0-9A-Fa-f]{3,8})['"]/g,
  )) {
    set(m[1], hexFromArgbToken(m[2] ?? ''))
  }
  for (const m of text.matchAll(
    /(\w+)\s*:\s*['"](#[0-9A-Fa-f]{3,8})['"]/g,
  )) {
    set(m[1], hexFromArgbToken(m[2] ?? ''))
  }

  // Android colors.xml: <color name="primary">#112233</color>
  for (const m of text.matchAll(/<color\b[^>]*\bname\s*=\s*["']([^"']+)["'][^>]*>\s*(#[0-9A-Fa-f]{3,8})/gi)) {
    set(m[1], hexFromArgbToken(m[2] ?? ''))
    set(`R.color.${m[1]}`, hexFromArgbToken(m[2] ?? ''))
  }

  // MAUI / XAML: <Color x:Key="Primary">#112233</Color>
  for (const m of text.matchAll(
    /<(?:Color|x:Color|SolidColorBrush)\b[^>]*\b(?:x:Key|Key)\s*=\s*["']([^"']+)["'][^>]*>\s*(#[0-9A-Fa-f]{3,8})/gi,
  )) {
    set(m[1], hexFromArgbToken(m[2] ?? ''))
  }
  for (const m of text.matchAll(
    /<(?:Color|SolidColorBrush)\b[^>]*\b(?:x:Key|Key)\s*=\s*["']([^"']+)["'][^>]*\bColor\s*=\s*["'](#[0-9A-Fa-f]{3,8})["']/gi,
  )) {
    set(m[1], hexFromArgbToken(m[2] ?? ''))
  }

  // Flutter / Compose ColorScheme roles (primary / onPrimary / …)
  const schemeRoles =
    'primary|onPrimary|primaryContainer|onPrimaryContainer|secondary|onSecondary|secondaryContainer|onSecondaryContainer|tertiary|onTertiary|error|onError|background|onBackground|surface|onSurface|surfaceVariant|outline|inversePrimary'
  for (const m of text.matchAll(
    new RegExp(
      `\\b(${schemeRoles})\\s*:\\s*(?:const\\s*)?Color\\s*\\(\\s*(0x[0-9A-Fa-f]{6,8})\\s*\\)`,
      'g',
    ),
  )) {
    const role = m[1]!
    const hex = hexFromArgbToken(m[2] ?? '')
    set(`colorScheme.${role}`, hex)
    set(`MaterialTheme.colorScheme.${role}`, hex)
    set(role, hex)
  }
  // ThemeData( primaryColor: Color(0x…), … )
  for (const m of text.matchAll(
    /\b(primaryColor|scaffoldBackgroundColor|cardColor|dividerColor|secondaryHeaderColor)\s*:\s*(?:const\s*)?Color\s*\(\s*(0x[0-9A-Fa-f]{6,8})\s*\)/g,
  )) {
    const role = m[1]!
    const hex = hexFromArgbToken(m[2] ?? '')
    set(role, hex)
    set(`ThemeData.${role}`, hex)
  }

  return out
}

function collectLocalImports(source: string, kind: NativeStyleKind): string[] {
  const out: string[] = []
  const push = (spec: string | undefined) => {
    if (!spec) return
    if (/^https?:/i.test(spec) || spec.startsWith('package:') || spec.startsWith('dart:')) return
    if (!(spec.startsWith('./') || spec.startsWith('../') || spec.startsWith('/'))) {
      // bare relative without ./ — allow styles, theme, colors paths
      if (!/(style|theme|color|palette|resource)/i.test(spec)) return
    }
    uniqPush(out, spec.replace(/\\/g, '/'))
  }

  if (kind === 'rn' || kind === 'arkui') {
    for (const m of source.matchAll(/\bimport\s+[^'"]*['"]([^'"]+)['"]/g)) push(m[1])
    for (const m of source.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) push(m[1])
  } else if (kind === 'flutter') {
    for (const m of source.matchAll(/\bimport\s+['"]([^'"]+)['"]/g)) push(m[1])
  } else if (kind === 'compose' || kind === 'android-view') {
    // Kotlin/Java imports are package names — look for string imports rare; prefer siblings
  } else if (kind === 'swiftui') {
    // Swift has no path imports; use siblings
  } else if (kind === 'maui') {
    for (const m of source.matchAll(/Source\s*=\s*["']([^"']+\.xaml)["']/gi)) push(m[1])
  }
  return out
}

async function resolveImportPath(
  fromFile: string,
  spec: string,
  kind: NativeStyleKind,
): Promise<string | undefined> {
  const dir = path.dirname(fromFile)
  const cleaned = spec.replace(/^\//, '')
  const candidates: string[] = []
  if (kind === 'flutter') {
    candidates.push(
      path.resolve(dir, cleaned),
      path.resolve(dir, cleaned.endsWith('.dart') ? cleaned : cleaned + '.dart'),
    )
  } else if (kind === 'rn' || kind === 'arkui') {
    for (const ext of ['', '.ts', '.tsx', '.js', '.jsx', '.ets']) {
      candidates.push(path.resolve(dir, cleaned + ext))
      candidates.push(path.resolve(dir, cleaned, 'index' + (ext || '.ts')))
    }
  } else if (kind === 'maui') {
    candidates.push(path.resolve(dir, cleaned))
  } else {
    candidates.push(path.resolve(dir, cleaned))
  }
  for (const c of candidates) {
    if (await readMaybe(c)) return c
  }
  return undefined
}

async function siblingCandidates(
  entryAbsolutePath: string,
  kind: NativeStyleKind,
): Promise<string[]> {
  const dir = path.dirname(entryAbsolutePath)
  const base = path.basename(entryAbsolutePath).replace(/\.[^.]+$/i, '')
  const names: string[] = []
  if (kind === 'rn') {
    names.push(
      'styles.ts',
      'styles.tsx',
      'styles.js',
      'style.ts',
      'style.tsx',
      'colors.ts',
      'colors.tsx',
      'theme.ts',
      'theme.tsx',
      `${base}.styles.ts`,
      `${base}.styles.tsx`,
      `${base}.style.ts`,
    )
  } else if (kind === 'flutter') {
    names.push(
      'theme.dart',
      'app_theme.dart',
      'colors.dart',
      'app_colors.dart',
      'styles.dart',
      'text_styles.dart',
      `${base}_theme.dart`,
    )
  } else if (kind === 'compose') {
    names.push(
      'Color.kt',
      'Colors.kt',
      'Theme.kt',
      'Type.kt',
      'AppColors.kt',
      `${base}Colors.kt`,
    )
  } else if (kind === 'swiftui') {
    names.push('Color+App.swift', 'Colors.swift', 'Theme.swift', 'AppColor.swift', 'Palette.swift')
  } else if (kind === 'maui') {
    names.push('Styles.xaml', 'Colors.xaml', 'Resources.xaml', 'App.xaml')
  } else if (kind === 'arkui') {
    names.push('colors.ets', 'theme.ets', `${base}.css`)
  }
  return names.map((n) => path.join(dir, n))
}

async function loadAndroidColorsXmlNear(entryAbsolutePath: string): Promise<string> {
  // Walk up looking for res/values*/colors*.xml
  let dir = path.dirname(entryAbsolutePath)
  for (let i = 0; i < 8; i += 1) {
    const res = path.join(dir, 'res')
    try {
      const entries = await readdir(res, { withFileTypes: true })
      const chunks: string[] = []
      for (const d of entries) {
        if (!d.isDirectory() || !/^values/.test(d.name)) continue
        const valueDir = path.join(res, d.name)
        let files: string[] = []
        try {
          files = await readdir(valueDir)
        } catch {
          continue
        }
        for (const f of files) {
          if (/color/i.test(f) && f.endsWith('.xml')) {
            chunks.push(await readMaybe(path.join(valueDir, f)))
          } else if (f === 'colors.xml' || f.endsWith('.xml')) {
            // Also scan generic values XML for <color>
            const text = await readMaybe(path.join(valueDir, f))
            if (/<color\b/i.test(text)) chunks.push(text)
          }
        }
      }
      if (chunks.length) return chunks.join('\n')
    } catch {
      /* keep walking */
    }
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return ''
}

async function loadMauiResourceDictionaries(entryAbsolutePath: string): Promise<string> {
  const dir = path.dirname(entryAbsolutePath)
  const chunks: string[] = []
  // Same folder + Resources/Styles common MAUI layout
  const roots = [dir, path.join(dir, 'Resources'), path.join(dir, 'Resources', 'Styles'), path.dirname(dir)]
  for (const root of roots) {
    for (const name of ['Styles.xaml', 'Colors.xaml', 'Resources.xaml', 'App.xaml']) {
      chunks.push(await readMaybe(path.join(root, name)))
    }
  }
  // ResourceDictionary Source= in the page itself is handled via imports
  return chunks.filter(Boolean).join('\n')
}

/**
 * Rewrite AppColors.primary / R.color.primary / {StaticResource Primary} into
 * concrete colour literals so existing shallow parsers can resolve them.
 *
 * Only qualified symbols (contain `.`) are globally substituted to avoid eating
 * common identifiers like `title` / `primary` in non-colour positions.
 */
export function rewriteColorSymbols(
  source: string,
  colors: Map<string, string>,
  kind: NativeStyleKind,
): string {
  if (!colors.size) return source
  let out = source

  // Android getColor(R.color.xxx) — before rewriting R.color.* tokens themselves.
  out = out.replace(
    /(?:ContextCompat\.)?getColor\s*\([^)]*R\.color\.(\w+)[^)]*\)/g,
    (full, name: string) => {
      const hex = colors.get(name) ?? colors.get(`R.color.${name}`)
      return hex ? `Color.parseColor("${hex}")` : full
    },
  )

  // MAUI StaticResource / DynamicResource → raw hex (attribute values)
  out = out.replace(
    /\{(?:StaticResource|DynamicResource)\s+(\w+)\s*\}/g,
    (full, name: string) => colors.get(name) ?? full,
  )

  // Flutter / Compose theme accessors before bare qualified rewrites.
  if (kind === 'flutter' || kind === 'compose') {
    const themeLiteral = (role: string): string | undefined => {
      const hex =
        colors.get(`MaterialTheme.colorScheme.${role}`) ??
        colors.get(`colorScheme.${role}`) ??
        colors.get(role)
      if (!hex) return undefined
      const h = hex.replace(/^#/, '')
      if (h.length === 8) return `Color(0x${h.slice(6)}${h.slice(0, 6)})`
      if (h.length === 6) return `Color(0xFF${h})`
      return undefined
    }
    out = out.replace(
      /MaterialTheme\.colorScheme\.(\w+)/g,
      (full, role: string) => themeLiteral(role) ?? full,
    )
    out = out.replace(
      /Theme\.of\s*\([^)]*\)\.colorScheme\.(\w+)/g,
      (full, role: string) => themeLiteral(role) ?? full,
    )
    out = out.replace(
      /Theme\.of\s*\([^)]*\)\.(primaryColor|scaffoldBackgroundColor|cardColor|dividerColor)/g,
      (full, role: string) => {
        const hex = colors.get(role) ?? colors.get(`ThemeData.${role}`) ?? colors.get(`colorScheme.${role === 'primaryColor' ? 'primary' : role}`)
        if (!hex) return full
        const h = hex.replace(/^#/, '')
        if (h.length === 8) return `Color(0x${h.slice(6)}${h.slice(0, 6)})`
        if (h.length === 6) return `Color(0xFF${h})`
        return full
      },
    )
  }

  // RN useTheme() / theme.colors.primary
  if (kind === 'rn') {
    const rnHex = (name: string): string | undefined => {
      const hex =
        colors.get(`theme.colors.${name}`) ??
        colors.get(`colors.${name}`) ??
        colors.get(name)
      if (!hex) return undefined
      return `'${hex.startsWith('#') ? hex : `#${hex}`}'`
    }
    out = out.replace(
      /(?:useTheme\s*\(\s*\)|theme)\.colors\.(\w+)/g,
      (full, name: string) => rnHex(name) ?? full,
    )
  }

  const toLiteral = (hex: string): string => {
    const h = hex.replace(/^#/, '')
    if (kind === 'rn' || kind === 'maui' || kind === 'arkui') return `'${hex.startsWith('#') ? hex : `#${h}`}'`
    // Flutter / Compose / Android / SwiftUI prefer Color(0xAARRGGBB)
    if (h.length === 8) return `Color(0x${h.slice(6)}${h.slice(0, 6)})`
    if (h.length === 6) return `Color(0xFF${h})`
    return `Color(0xFF000000)`
  }

  const qualified = [...colors.keys()]
    .filter((k) => k.includes('.'))
    .sort((a, b) => b.length - a.length)

  for (const key of qualified) {
    const hex = colors.get(key)!
    const escaped = key.replace(/\./g, '\\.')
    out = out.replace(new RegExp(`\\b${escaped}\\b`, 'g'), toLiteral(hex))
  }

  return out
}

export interface NativeStyleContext {
  /** Entry + companion sources with colour symbols rewritten to hex literals. */
  source: string
  colors: Map<string, string>
  /** Flutter TextTheme role → fontSize. */
  textSizes: Map<string, number>
  /** Extra XAML resource dictionaries (MAUI). */
  resourceXaml: string
}

/** Material 3 / common TextTheme default sizes (sp) when theme file omits them. */
export const FLUTTER_TEXT_THEME_DEFAULTS: Record<string, number> = {
  displayLarge: 57,
  displayMedium: 45,
  displaySmall: 36,
  headlineLarge: 32,
  headlineMedium: 28,
  headlineSmall: 24,
  titleLarge: 22,
  titleMedium: 16,
  titleSmall: 14,
  bodyLarge: 16,
  bodyMedium: 14,
  bodySmall: 12,
  labelLarge: 14,
  labelMedium: 12,
  labelSmall: 11,
  // Legacy Material 2 names
  headline1: 96,
  headline2: 60,
  headline3: 48,
  headline4: 34,
  headline5: 24,
  headline6: 20,
  subtitle1: 16,
  subtitle2: 14,
  bodyText1: 16,
  bodyText2: 14,
  caption: 12,
  button: 14,
  overline: 10,
}

/** Extract `titleLarge: TextStyle(fontSize: 22)` style sizes from Dart. */
export function extractTextThemeSizes(text: string): Map<string, number> {
  const out = new Map<string, number>()
  for (const [role, size] of Object.entries(FLUTTER_TEXT_THEME_DEFAULTS)) {
    out.set(role, size)
  }
  const roles = Object.keys(FLUTTER_TEXT_THEME_DEFAULTS).join('|')
  for (const m of text.matchAll(
    new RegExp(
      `\\b(${roles})\\s*:\\s*TextStyle\\s*\\([\\s\\S]*?fontSize\\s*:\\s*([\\d.]+)`,
      'g',
    ),
  )) {
    out.set(m[1]!, Number(m[2]))
  }
  // Bare TextStyle assigned to a role via cascade less common — also:
  for (const m of text.matchAll(
    new RegExp(`textTheme\\.[\\s\\S]{0,80}?\\b(${roles})\\s*[:=][^;]*fontSize\\s*:\\s*([\\d.]+)`, 'g'),
  )) {
    out.set(m[1]!, Number(m[2]))
  }
  return out
}

/** Rewrite Theme.of(context).textTheme.titleLarge → TextStyle(fontSize: N). */
export function rewriteTextThemeSymbols(
  source: string,
  sizes: Map<string, number>,
): string {
  if (!sizes.size) return source
  const roles = [...sizes.keys()].sort((a, b) => b.length - a.length)
  let out = source
  for (const role of roles) {
    const size = sizes.get(role)
    if (size === undefined) continue
    const lit = `TextStyle(fontSize: ${size})`
    out = out.replace(
      new RegExp(
        `Theme\\.of\\s*\\([^)]*\\)\\.textTheme\\.${role}\\b(?:\\s*!)?(?:\\s*\\.copyWith\\([^)]*\\))?`,
        'g',
      ),
      lit,
    )
    out = out.replace(
      new RegExp(`textTheme\\.${role}\\b(?:\\s*!)?(?:\\s*\\.copyWith\\([^)]*\\))?`, 'g'),
      lit,
    )
  }
  return out
}

/** Material 3 Compose Typography defaults (sp). */
export const COMPOSE_TYPOGRAPHY_DEFAULTS: Record<string, number> = {
  displayLarge: 57,
  displayMedium: 45,
  displaySmall: 36,
  headlineLarge: 32,
  headlineMedium: 28,
  headlineSmall: 24,
  titleLarge: 22,
  titleMedium: 16,
  titleSmall: 14,
  bodyLarge: 16,
  bodyMedium: 14,
  bodySmall: 12,
  labelLarge: 14,
  labelMedium: 12,
  labelSmall: 11,
}

/** Extract Compose `titleLarge = TextStyle(fontSize = 22.sp)` sizes. */
export function extractComposeTypographySizes(text: string): Map<string, number> {
  const out = new Map<string, number>()
  for (const [role, size] of Object.entries(COMPOSE_TYPOGRAPHY_DEFAULTS)) {
    out.set(role, size)
  }
  const roles = Object.keys(COMPOSE_TYPOGRAPHY_DEFAULTS).join('|')
  for (const m of text.matchAll(
    new RegExp(
      `\\b(${roles})\\s*=\\s*TextStyle\\s*\\([\\s\\S]*?fontSize\\s*=\\s*([\\d.]+)\\s*\\.sp`,
      'g',
    ),
  )) {
    out.set(m[1]!, Number(m[2]))
  }
  return out
}

/** Rewrite MaterialTheme.typography.titleLarge → fontSize = N.sp */
export function rewriteComposeTypographySymbols(
  source: string,
  sizes: Map<string, number>,
): string {
  if (!sizes.size) return source
  let out = source
  const roles = [...sizes.keys()].sort((a, b) => b.length - a.length)
  for (const role of roles) {
    const size = sizes.get(role)
    if (size === undefined) continue
    const lit = `TextStyle(fontSize = ${size}.sp)`
    out = out.replace(
      new RegExp(`MaterialTheme\\.typography\\.${role}\\b`, 'g'),
      lit,
    )
    out = out.replace(new RegExp(`(?<!MaterialTheme\\.)typography\\.${role}\\b`, 'g'), lit)
  }
  return out
}

/** Material 3 Shapes default corner radii (dp). */
export const COMPOSE_SHAPE_DEFAULTS: Record<string, number> = {
  extraSmall: 4,
  small: 4,
  medium: 12,
  large: 16,
  extraLarge: 28,
}

/** Extract Compose `small = RoundedCornerShape(8.dp)` radii. */
export function extractComposeShapeSizes(text: string): Map<string, number> {
  const out = new Map<string, number>()
  for (const [role, size] of Object.entries(COMPOSE_SHAPE_DEFAULTS)) {
    out.set(role, size)
  }
  const roles = Object.keys(COMPOSE_SHAPE_DEFAULTS).join('|')
  for (const m of text.matchAll(
    new RegExp(
      `\\b(${roles})\\s*=\\s*RoundedCornerShape\\s*\\(\\s*([\\d.]+)\\s*(?:\\.dp)?`,
      'g',
    ),
  )) {
    out.set(m[1]!, Number(m[2]))
  }
  return out
}

/** Rewrite MaterialTheme.shapes.medium → RoundedCornerShape(N.dp) */
export function rewriteComposeShapeSymbols(
  source: string,
  sizes: Map<string, number>,
): string {
  if (!sizes.size) return source
  let out = source
  const roles = [...sizes.keys()].sort((a, b) => b.length - a.length)
  for (const role of roles) {
    const size = sizes.get(role)
    if (size === undefined) continue
    const lit = `RoundedCornerShape(${size}.dp)`
    out = out.replace(
      new RegExp(`MaterialTheme\\.shapes\\.${role}\\b`, 'g'),
      lit,
    )
    out = out.replace(new RegExp(`(?<!MaterialTheme\\.)shapes\\.${role}\\b`, 'g'), lit)
  }
  return out
}

/**
 * Common Harmony / ArkUI float size tokens (fp).
 * Keys are the float resource leaf names (`app.float.X` / `sys.float.X`).
 */
export const ARKUI_FONT_SIZE_DEFAULTS: Record<string, number> = {
  title: 20,
  title_size: 20,
  subtitle: 16,
  body: 14,
  body_size: 14,
  caption: 12,
  ohos_id_text_size_headline1: 24,
  ohos_id_text_size_headline2: 20,
  ohos_id_text_size_headline3: 18,
  ohos_id_text_size_headline4: 16,
  ohos_id_text_size_headline5: 16,
  ohos_id_text_size_headline6: 14,
  ohos_id_text_size_headline7: 14,
  ohos_id_text_size_headline8: 14,
  ohos_id_text_size_headline9: 14,
  ohos_id_text_size_body1: 16,
  ohos_id_text_size_body2: 14,
  ohos_id_text_size_body3: 12,
  ohos_id_text_size_button1: 16,
  ohos_id_text_size_button2: 14,
  ohos_id_text_size_caption: 10,
  ohos_id_text_size_subheader: 14,
}

/** Extract ArkUI `FontSize.title = 18` / `FontSizes = { body: 14 }` maps. */
export function extractArkuiFontSizes(text: string): Map<string, number> {
  const out = new Map<string, number>()
  for (const [k, v] of Object.entries(ARKUI_FONT_SIZE_DEFAULTS)) {
    out.set(k, v)
    out.set(`app.float.${k}`, v)
    out.set(`sys.float.${k}`, v)
  }
  for (const m of text.matchAll(
    /(?:export\s+)?(?:const|let)\s+(FontSize|FontSizes|fontSize|fontSizes)\s*=\s*\{([\s\S]*?)\}/g,
  )) {
    const ns = m[1] ?? ''
    for (const cm of (m[2] ?? '').matchAll(/(\w+)\s*:\s*(\d+(?:\.\d+)?)/g)) {
      const name = cm[1]!
      const size = Number(cm[2])
      if (!Number.isFinite(size)) continue
      out.set(name, size)
      out.set(`${ns}.${name}`, size)
      out.set(`app.float.${name}`, size)
    }
  }
  for (const m of text.matchAll(
    /\b([A-Za-z_][\w]*[Ff]ont[Ss]ize[A-Za-z0-9_]*|[A-Za-z_][\w]*_SIZE)\s*=\s*(\d+(?:\.\d+)?)/g,
  )) {
    const size = Number(m[2])
    if (Number.isFinite(size)) out.set(m[1]!, size)
  }
  return out
}

/** Rewrite FontSize.title / $r('app.float.body') → numeric literals for ArkUI. */
export function rewriteArkuiFontSizeSymbols(
  source: string,
  sizes: Map<string, number>,
): string {
  if (!sizes.size) return source
  let out = source
  out = out.replace(
    /\$r\s*\(\s*['"]((?:app|sys)\.float\.[^'"]+)['"]\s*\)/g,
    (full, key: string) => {
      const leaf = key.replace(/^(?:app|sys)\.float\./, '')
      const size =
        sizes.get(key) ??
        sizes.get(leaf) ??
        ARKUI_FONT_SIZE_DEFAULTS[leaf]
      return size !== undefined ? String(size) : full
    },
  )
  const qualified = [...sizes.keys()]
    .filter((k) => k.includes('.'))
    .sort((a, b) => b.length - a.length)
  for (const key of qualified) {
    if (/^(?:app|sys)\.float\./.test(key)) continue
    const size = sizes.get(key)
    if (size === undefined) continue
    const escaped = key.replace(/\./g, '\\.')
    out = out.replace(new RegExp(`\\b${escaped}\\b`, 'g'), String(size))
  }
  return out
}

/**
 * Load companion theme/style files and rewrite colour symbols in the entry source.
 */
export async function loadNativeStyleContext(
  entryAbsolutePath: string,
  entrySource: string,
  kind: NativeStyleKind,
): Promise<NativeStyleContext> {
  const chunks: string[] = [entrySource]
  const seen = new Set<string>([path.resolve(entryAbsolutePath)])

  for (const abs of await siblingCandidates(entryAbsolutePath, kind)) {
    const resolved = path.resolve(abs)
    if (seen.has(resolved)) continue
    const text = await readMaybe(resolved)
    if (!text) continue
    seen.add(resolved)
    chunks.push(text)
  }

  for (const spec of collectLocalImports(entrySource, kind)) {
    const abs = await resolveImportPath(entryAbsolutePath, spec, kind)
    if (!abs) continue
    const resolved = path.resolve(abs)
    if (seen.has(resolved)) continue
    const text = await readMaybe(resolved)
    if (!text) continue
    seen.add(resolved)
    chunks.push(text)
  }

  let resourceXaml = ''
  if (kind === 'android-view') {
    chunks.push(await loadAndroidColorsXmlNear(entryAbsolutePath))
  }
  if (kind === 'maui') {
    resourceXaml = await loadMauiResourceDictionaries(entryAbsolutePath)
    chunks.push(resourceXaml)
  }

  const merged = chunks.filter((c) => c.trim()).join('\n\n')
  const colors = extractColorSymbols(merged)
  let rewritten = rewriteColorSymbols(
    entrySource + '\n\n' + chunks.slice(1).join('\n\n'),
    colors,
    kind,
  )
  let textSizes = new Map<string, number>()
  if (kind === 'flutter') {
    textSizes = extractTextThemeSizes(merged)
    rewritten = rewriteTextThemeSymbols(rewritten, textSizes)
  } else if (kind === 'compose') {
    textSizes = extractComposeTypographySizes(merged)
    rewritten = rewriteComposeTypographySymbols(rewritten, textSizes)
    const shapeSizes = extractComposeShapeSizes(merged)
    rewritten = rewriteComposeShapeSymbols(rewritten, shapeSizes)
  } else if (kind === 'arkui') {
    textSizes = extractArkuiFontSizes(merged)
    rewritten = rewriteArkuiFontSizeSymbols(rewritten, textSizes)
  }

  return { source: rewritten, colors, textSizes, resourceXaml }
}
