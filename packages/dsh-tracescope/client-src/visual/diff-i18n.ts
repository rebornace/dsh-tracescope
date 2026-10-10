import { getT } from '../locales/i18n.js'

export type TranslateFn = (key: string, params?: Record<string, unknown>) => string

export function diffPropLabel(t: TranslateFn, property: string): string {
  const key = `diff.prop.${property}`
  const label = t(key)
  return label !== key ? label : property
}

export function diffSeverityLabel(
  t: TranslateFn,
  severity: 'high' | 'medium' | 'low',
): string {
  return t(`diff.severity.${severity}`)
}

export function resolveT(t?: TranslateFn): TranslateFn {
  return t ?? getT()
}
