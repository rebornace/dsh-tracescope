import type { GitAuth } from './auth.js'

/** Risk level for a scoped test item. */
export type RiskLevel = 'high' | 'medium' | 'low'

/** How an item entered the scope report. */
export type ImpactKind = 'direct' | 'ripple'

export interface Evidence {
  /** Short machine-readable reason code. */
  code: string
  /** Human-readable explanation. */
  detail: string
}

/** Screenshot attached to a failed checklist item (compressed data URL). */
export interface TesterScreenshot {
  id: string
  name: string
  mime: string
  /** JPEG/PNG data URL, e.g. data:image/jpeg;base64,… */
  dataUrl: string
}

export interface ScopeItem {
  id: string
  /** Product-facing display name (may equal file heuristic when no better source). */
  displayName: string
  kind: ImpactKind
  risk: RiskLevel
  /** Relative paths that justify this item. */
  files: string[]
  evidence: Evidence[]
  /** Suggested manual checks; filled by templates and optionally polished by an LLM. */
  suggestedSteps: string[]
  /** Checklist status for testers. */
  status: 'pending' | 'pass' | 'fail' | 'skip'
  /** Tester note when failed — feedback for developers. */
  testerNote?: string
  /** Optional screenshots attached when failed. */
  testerScreenshots?: TesterScreenshot[]
}

/** File attached to the whole hand-test task (video / doc), not a single checklist row. */
export interface ReportAttachment {
  id: string
  name: string
  mime: string
  size: number
  /** Filename under ~/.tracescope/attachments/{reportKey}/ */
  storedName: string
  addedAt: string
}

export interface ImpactReport {
  repoPath: string
  baseCommit: string
  headCommit: string
  generatedAt: string
  /** True when the report was refined / replaced by model diff analysis. */
  modelEnriched: boolean
  direct: ScopeItem[]
  ripple: ScopeItem[]
  changedFiles: string[]
  /** Task-level attachments (videos, docs, etc.). */
  attachments?: ReportAttachment[]
}

export interface ModuleMappingRule {
  /** Glob-like prefix or substring matched against relative paths (simple contains / prefix*). */
  match: string
  /** Product-facing name. */
  name: string
  risk?: RiskLevel
}

export interface TracescopeModulesConfig {
  modules: ModuleMappingRule[]
}

export interface AnalyzeImpactOptions {
  /**
   * Local git work-tree path, or a remote URL
   * (`https://…`, `git@…`, `github.com/org/repo`).
   * Remote URLs are cloned under `~/.tracescope/repos`.
   */
  repoPath: string
  baseCommit: string
  headCommit: string
  /** Max reverse-dependency BFS depth. Default 2. */
  rippleDepth?: number
  /** Optional path to tracescope.modules.yml */
  modulesConfigPath?: string
  /** Optional in-memory config (wins over file when both set). */
  modulesConfig?: TracescopeModulesConfig
  /**
   * Fetch remotes before analysis.
   * Default: true for remote URLs, false for local paths.
   */
  fetchRemote?: boolean
  /** Override remote-clone cache root. */
  cacheRoot?: string
  /** Credentials for private remotes (HTTPS token or SSH key). */
  auth?: GitAuth
  /**
   * Optional model hook. Receives the deterministic report and may rewrite the
   * scope from real diffs (merge scenarios, add inferred ripple).
   */
  enrichWithModel?: (report: ImpactReport) => Promise<ImpactReport>
}
