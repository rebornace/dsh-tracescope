import { readFile } from 'node:fs/promises'
import YAML from 'yaml'
import type { ModuleMappingRule, TracescopeModulesConfig } from './types.js'

export async function loadModulesConfig(
  path: string | undefined,
): Promise<TracescopeModulesConfig> {
  if (!path) return { modules: [] }
  const text = await readFile(path, 'utf8')
  const parsed = YAML.parse(text) as TracescopeModulesConfig | null
  if (!parsed || !Array.isArray(parsed.modules)) {
    return { modules: [] }
  }
  return {
    modules: parsed.modules.filter(
      (m): m is ModuleMappingRule =>
        typeof m?.match === 'string' && typeof m?.name === 'string',
    ),
  }
}

/** Simple matcher: `foo*` prefix, or substring contains. */
export function matchModuleRule(
  relativePath: string,
  rules: ModuleMappingRule[],
): ModuleMappingRule | undefined {
  const normalized = relativePath.replace(/\\/g, '/')
  for (const rule of rules) {
    const pattern = rule.match.replace(/\\/g, '/')
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1)
      if (normalized.startsWith(prefix) || normalized.includes(`/${prefix}`)) {
        return rule
      }
    } else if (normalized.includes(pattern)) {
      return rule
    }
  }
  return undefined
}
