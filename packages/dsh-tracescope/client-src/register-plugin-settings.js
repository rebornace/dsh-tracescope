/**
 * Register TraceScope on Desktop / Web plugin detail seats.
 *
 * Bundle detail:
 * - plugins.bundle.config — “插件更新” card (kept for MCP / non-DSH update paths)
 *
 * Do not inject plugins.detail.actions: official DSH Desktop now owns the
 * header update control next to Uninstall.
 * Do not register plugins.detail.section (that duplicated the card).
 */
import { jsx } from 'react/jsx-runtime'
import { PluginSettingsCard } from './PluginSettingsCard.tsx'
import { createTranslator, getT, setModuleTranslator } from './locales/i18n.js'
import { PACKAGE_NAME, setSelfUpdateHostCtx } from './self-update.js'

export var SETTINGS_NS = 'tracescope'
export { PACKAGE_NAME }

/**
 * @param {object} ctx cordis client context with slots (and optional inject)
 */
export function registerPluginSettings(ctx) {
  if (!ctx || !ctx.slots || typeof ctx.slots.inject !== 'function') return
  setSelfUpdateHostCtx(ctx)
  // apply() owns wireTracescopeI18n; here only refresh the live translator handle.
  try {
    setModuleTranslator(createTranslator(ctx))
  } catch (_e) {}

  ctx.slots.inject('plugins.bundle.config', function () {
    return ctx.slots.register(
      {
        name: 'plugins.bundle.config',
        key: PACKAGE_NAME,
        locale: SETTINGS_NS,
      },
      function BundleConfig(ownerProps) {
        var view = ownerProps && ownerProps.view
        var version =
          (ownerProps && ownerProps.pkg && ownerProps.pkg.version) ||
          (ownerProps && ownerProps.installedVersion) ||
          null
        if (view === 'summary') {
          return jsx(PluginSettingsCard, {
            summaryOnly: true,
            installedVersion: version,
            t: getT(),
          })
        }
        return jsx(PluginSettingsCard, { installedVersion: version, t: getT() })
      },
    )
  })

  if (typeof ctx.inject === 'function') {
    ctx.inject(['settingsScope'], function (scoped) {
      if (!scoped || !scoped.slots) return
      scoped.slots.inject('settings.plugin.item', function () {
        return scoped.slots.register(
          {
            name: 'settings.plugin.item',
            key: SETTINGS_NS,
            locale: SETTINGS_NS,
          },
          function SettingsPluginItem() {
            return jsx(PluginSettingsCard, { t: getT() })
          },
        )
      })
    })
  }
}
