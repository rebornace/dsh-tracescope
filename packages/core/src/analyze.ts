import { createHash } from 'node:crypto'
import path from 'node:path'
import {
  extractAndroidStringTitles,
  extractKotlinUiTitles,
  extractLayoutTitles,
  extractLocalizableTitles,
  extractObjCNavTitles,
  pickBestTitle,
} from './display-names.js'
import { buildSourceIndex, rippleFrom } from './deps.js'
import { gitDiffFiles, gitRevParse } from './git.js'
import {
  classifyFileRisk,
  detectLanguage,
  heuristicDisplayName,
} from './heuristics.js'
import { loadModulesConfig, matchModuleRule } from './modules-config.js'
import { resolveGitRepo } from './repo.js'
import { ensureUniqueScopeItemIds } from './scope-ids.js'
import type {
  AnalyzeImpactOptions,
  Evidence,
  ImpactReport,
  RiskLevel,
  ScopeItem,
} from './types.js'

function riskRank(r: RiskLevel): number {
  switch (r) {
    case 'high':
      return 3
    case 'medium':
      return 2
    case 'low':
      return 1
    default: {
      const _exhaustive: never = r
      return _exhaustive
    }
  }
}

function maxRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
  return riskRank(a) >= riskRank(b) ? a : b
}

function slugId(kind: string, name: string, files: string[]): string {
  const key = `${kind}:${name}:${files.slice(0, 3).join('|')}`
  return createHash('sha1').update(key).digest('hex').slice(0, 20)
}

function defaultSteps(displayName: string, kind: 'direct' | 'ripple'): string[] {
  if (kind === 'direct') {
    return [
      `打开「${displayName}」相关入口，确认页面可进入`,
      `覆盖该处本次改动的主路径（增/改/查）各走一遍`,
      `检查异常路径：无网、空数据、权限拒绝（如适用）`,
    ]
  }
  return [
    `从可能受影响的入口进入「${displayName}」`,
    `确认与直接变更模块的联动仍正常（跳转/数据回填）`,
    `回归该页核心只读路径，避免静默破坏`,
  ]
}

function resolveDisplayName(
  relativePath: string,
  content: string | undefined,
  mappedName: string | undefined,
): { displayName: string; evidence: Evidence[] } {
  const evidence: Evidence[] = []
  if (mappedName) {
    evidence.push({ code: 'modules_yml', detail: `映射表命中：${mappedName}` })
    return { displayName: mappedName, evidence }
  }

  const fallback = heuristicDisplayName(relativePath)
  const candidates: string[] = []
  if (content) {
    const lang = detectLanguage(relativePath)
    if (lang === 'kotlin') candidates.push(...extractKotlinUiTitles(content))
    if (lang === 'objc') candidates.push(...extractObjCNavTitles(content))
    if (/\.xml$/i.test(relativePath)) {
      if (/strings\.xml$/i.test(relativePath)) {
        candidates.push(...extractAndroidStringTitles(content))
      } else {
        candidates.push(...extractLayoutTitles(content))
      }
    }
    if (/Localizable\.strings$/i.test(relativePath)) {
      candidates.push(...extractLocalizableTitles(content))
    }
  }

  if (candidates.length > 0) {
    const title = pickBestTitle(candidates, fallback)
    evidence.push({
      code: 'static_title',
      detail: `从源码/资源抽取标题候选：${candidates.slice(0, 5).join('、')}`,
    })
    return { displayName: title, evidence }
  }

  evidence.push({ code: 'path_heuristic', detail: `路径启发式：${relativePath}` })
  return { displayName: fallback, evidence }
}

function groupKey(displayName: string, moduleMatch: string | undefined): string {
  return moduleMatch ? `mod:${moduleMatch}` : `name:${displayName}`
}

/**
 * Deterministic impact analysis. Optional `enrichWithModel` may polish names/steps only.
 */
export async function analyzeImpact(options: AnalyzeImpactOptions): Promise<ImpactReport> {
  const depth = options.rippleDepth ?? 2
  const resolved = await resolveGitRepo(options.repoPath, {
    fetch: options.fetchRemote,
    cacheRoot: options.cacheRoot,
    auth: options.auth,
  })
  const repoPath = resolved.repoPath
  const baseCommit = await gitRevParse(repoPath, options.baseCommit)
  const headCommit = await gitRevParse(repoPath, options.headCommit)
  const changedFiles = await gitDiffFiles(repoPath, baseCommit, headCommit)

  const modulesConfig =
    options.modulesConfig ?? (await loadModulesConfig(options.modulesConfigPath))
  const index = await buildSourceIndex(repoPath)

  type Acc = {
    displayName: string
    kind: 'direct' | 'ripple'
    risk: RiskLevel
    files: Set<string>
    evidence: Evidence[]
  }
  const groups = new Map<string, Acc>()

  const touch = (
    file: string,
    kind: 'direct' | 'ripple',
    extra: Evidence[],
    riskHint?: RiskLevel,
  ) => {
    const rule = matchModuleRule(file, modulesConfig.modules)
    const content = index.files.get(file)
    const { displayName, evidence } = resolveDisplayName(file, content, rule?.name)
    const key = groupKey(displayName, rule?.match)
    const fileRisk = riskHint ?? rule?.risk ?? classifyFileRisk(file)
    const existing = groups.get(key)
    if (!existing) {
      groups.set(key, {
        displayName,
        kind,
        risk: fileRisk,
        files: new Set([file]),
        evidence: [...evidence, ...extra],
      })
      return
    }
    existing.files.add(file)
    existing.risk = maxRisk(existing.risk, fileRisk)
    // Prefer keeping direct over ripple if same group
    if (existing.kind === 'ripple' && kind === 'direct') existing.kind = 'direct'
    for (const e of [...evidence, ...extra]) {
      if (!existing.evidence.some((x) => x.detail === e.detail)) {
        existing.evidence.push(e)
      }
    }
  }

  for (const file of changedFiles) {
    touch(file, 'direct', [
      { code: 'git_diff', detail: `相对 ${baseCommit.slice(0, 7)}…${headCommit.slice(0, 7)} 直接变更` },
    ])
  }

  const ripples = rippleFrom(changedFiles, index.reverseDeps, depth)
  for (const [file, meta] of ripples) {
    touch(
      file,
      'ripple',
      [
        {
          code: 'dep_ripple',
          detail: `反向依赖第 ${meta.depth} 层，经由 ${meta.via}`,
        },
      ],
      // Ripple defaults one notch lower unless already high via rules
      classifyFileRisk(file) === 'high' ? 'high' : 'medium',
    )
  }

  const toItem = (acc: Acc): ScopeItem => {
    const files = [...acc.files].sort()
    return {
      id: slugId(acc.kind, acc.displayName, files),
      displayName: acc.displayName,
      kind: acc.kind,
      risk: acc.risk,
      files,
      evidence: acc.evidence,
      suggestedSteps: defaultSteps(acc.displayName, acc.kind),
      status: 'pending',
    }
  }

  const all = [...groups.values()].map(toItem)
  const sortItems = (items: ScopeItem[]) =>
    items.sort((a, b) => riskRank(b.risk) - riskRank(a.risk) || a.displayName.localeCompare(b.displayName))

  let report: ImpactReport = {
    repoPath: path.resolve(repoPath),
    baseCommit,
    headCommit,
    generatedAt: new Date().toISOString(),
    modelEnriched: false,
    direct: sortItems(all.filter((i) => i.kind === 'direct')),
    ripple: sortItems(all.filter((i) => i.kind === 'ripple')),
    changedFiles,
  }

  if (options.enrichWithModel) {
    report = await options.enrichWithModel(report)
    report = { ...report, modelEnriched: true }
  }

  return ensureUniqueScopeItemIds(report)
}
