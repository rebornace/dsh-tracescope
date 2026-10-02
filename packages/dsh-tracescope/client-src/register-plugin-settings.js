/**
 * Register TraceScope on Desktop / Web plugin detail seats.
 *
 * Bundle detail:
 * - plugins.detail.actions — Update next to Uninstall
 * - plugins.bundle.config  — always-open status (not a second collapsed card)
 *
 * Do not register plugins.detail.section (that duplicated the card).
 */
import { jsx } from 'react/jsx-runtime'
import { PluginSettingsCard, PluginUpdateAction } from './PluginSettingsCard.tsx'
import { PACKAGE_NAME, setSelfUpdateHostCtx } from './self-update.js'

export var SETTINGS_NS = 'tracescope'
export { PACKAGE_NAME }

function isOurBundle(subject) {
  return (
    subject &&
    subject.kind === 'bundle' &&
    subject.pkg &&
    subject.pkg.name === PACKAGE_NAME
  )
}

/**
 * @param {object} ctx cordis client context with slots (and optional inject)
 */
export function registerPluginSettings(ctx) {
  if (!ctx || !ctx.slots || typeof ctx.slots.inject !== 'function') return
  setSelfUpdateHostCtx(ctx)

  ctx.slots.inject('plugins.detail.actions', function () {
    return ctx.slots.register(
      {
        name: 'plugins.detail.actions',
        id: 'tracescope-update-action',
        order: 20,
      },
      function DetailAction(ownerProps) {
        var subject = ownerProps && ownerProps.subject
        if (!isOurBundle(subject)) return null
        return jsx(PluginUpdateAction, {
          installedVersion: (subject.pkg && subject.pkg.version) || null,
        })
      },
    )
  })

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
          return jsx(PluginSettingsCard, { summaryOnly: true, installedVersion: version })
        }
        return jsx(PluginSettingsCard, { installedVersion: version })
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
            return jsx(PluginSettingsCard, {})
          },
        )
      })
    })
  }
}
