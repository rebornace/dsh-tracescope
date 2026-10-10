/**
 * TraceScope self-update — no hard dependency on dshmarket.
 *
 * Check: Host `/tracescope/v1/self-update/check` (npm / npmmirror).
 * Apply (in order):
 *   1. Official Host `pluginManager.installBundle` (Desktop / Web Plugins)
 *   2. Optional dshmarket Update API v1 — only if already present
 *   3. Manual guide (Extension Dock / CLI)
 */
import { getT } from './locales/i18n.js'

export var PACKAGE_NAME = '@rebornace/dsh-tracescope'

/** Set once from client apply(); used by settings cards that lack a ctx prop. */
var hostClientCtx = null

export function setSelfUpdateHostCtx(ctx) {
  hostClientCtx = ctx || null
}

export function getSelfUpdateHostCtx() {
  return hostClientCtx
}

function parseJson(text) {
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch (_e) {
    throw new Error(text.slice(0, 200) || getT()('errors.emptyResponse'))
  }
}

function hostFetch(path, options) {
  return fetch(path, Object.assign({ credentials: 'same-origin' }, options || {})).then(function (r) {
    return r.text().then(function (text) {
      return { ok: r.ok, status: r.status, data: parseJson(text) }
    })
  })
}

/**
 * @returns {Promise<{
 *   packageName: string,
 *   installedVersion: string|null,
 *   latestVersion: string|null,
 *   updateAvailable: boolean,
 *   registrySource: string|null,
 *   applyHint: { pluginManagerSpec: string, cli: string, desktop: string },
 * }>}
 */
export function checkSelfUpdate() {
  return hostFetch('/tracescope/v1/self-update/check').then(function (res) {
    if (!res.ok) {
      var t = getT()
      throw new Error(
        (res.data && res.data.error) || t('update.selfUpdate.checkHttpFailed', { status: res.status }),
      )
    }
    var tCheck = getT()
    return {
      packageName: res.data.packageName || PACKAGE_NAME,
      installedVersion: res.data.installedVersion || null,
      latestVersion: res.data.latestVersion || null,
      updateAvailable: res.data.updateAvailable === true,
      registrySource: res.data.registrySource || null,
      applyHint: res.data.applyHint || {
        pluginManagerSpec: PACKAGE_NAME,
        cli: 'dsh plugin update ' + PACKAGE_NAME,
        desktop: tCheck('update.selfUpdate.defaultDesktopHint'),
      },
    }
  })
}

function unwrapRemote(result) {
  var t = getT()
  if (result == null) return { ok: false, error: t('update.selfUpdate.emptyRemote') }
  if (typeof result === 'object' && 'ok' in result) {
    if (result.ok === true) return { ok: true, value: result.value !== undefined ? result.value : result }
    return {
      ok: false,
      error:
        (result.error && (result.error.message || result.error.code || String(result.error))) ||
        t('update.selfUpdate.remoteCallFailed'),
    }
  }
  return { ok: true, value: result }
}

/** Resolve official pluginManager without importing Host packages. */
export function resolvePluginManager(ctx) {
  if (!ctx) return null
  var candidates = []
  try {
    if (ctx.pluginManager) candidates.push(ctx.pluginManager)
  } catch (_e) {}
  try {
    if (typeof ctx.get === 'function') {
      var viaGet = ctx.get('pluginManager')
      if (viaGet) candidates.push(viaGet)
    }
  } catch (_e) {}
  try {
    var remotes = ctx.remotes || (typeof ctx.get === 'function' ? ctx.get('remotes') : null)
    if (remotes && remotes.pluginManager) candidates.push(remotes.pluginManager)
  } catch (_e) {}
  try {
    var typert = ctx.typert || (typeof ctx.get === 'function' ? ctx.get('typert') : null)
    if (typert && typert.pluginManager) candidates.push(typert.pluginManager)
  } catch (_e) {}

  for (var i = 0; i < candidates.length; i++) {
    var pm = candidates[i]
    if (pm && typeof pm.installBundle === 'function') return pm
  }
  return null
}

function manualGuide(info) {
  var t = getT()
  var hint = (info && info.applyHint) || {}
  return (
    (hint.desktop || t('update.selfUpdate.manualGuideDesktop')) +
    '\n' +
    t('update.selfUpdate.manualGuideCliPrefix') +
    (hint.cli || 'dsh plugin update ' + PACKAGE_NAME)
  )
}

/**
 * Optional soft path — never required.
 * @returns {Promise<object|null>} market discovery or null
 */
function discoverMarketOptional() {
  return fetch('/dsh-market/api/v1/capabilities', { credentials: 'same-origin' })
    .then(function (r) {
      if (!r.ok) return null
      return r.json().then(function (data) {
        if (!data || data.schema !== 'dsh-market/update-api/v1') return null
        var features = data.features || {}
        if (features.update === false) return null
        return {
          endpoints: {
            updates: (data.endpoints && data.endpoints.updates) || '/dsh-market/api/v1/updates',
            operations: (data.endpoints && data.endpoints.operations) || '/dsh-market/api/v1/operations',
            restart: (data.endpoints && data.endpoints.restart) || '/dsh-market/api/v1/restart',
          },
          canRestart: features.restart === true && data.restart && data.restart.supported === true,
          restartManagedBy: (data.restart && data.restart.managedBy) || null,
        }
      })
    })
    .catch(function () {
      return null
    })
}

function sleep(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms)
  })
}

function waitMarketOperation(discovery, operationId, onProgress) {
  var attempt = 0
  function tick() {
    attempt += 1
    var path =
      discovery.endpoints.operations + '?operationId=' + encodeURIComponent(operationId)
    return fetch(path, { credentials: 'same-origin' })
      .then(function (r) {
        return r.json().then(function (data) {
          var op = (data && data.operation) || data
          if (typeof onProgress === 'function') onProgress(op)
          if (
            op &&
            (op.state === 'succeeded' ||
              op.state === 'failed' ||
              op.state === 'cancelled' ||
              op.state === 'rolled-back')
          ) {
            return op
          }
          if (attempt >= 180) throw new Error(getT()('update.selfUpdate.timeout'))
          return sleep(900).then(tick)
        })
      })
  }
  return tick()
}

function applyViaMarket(force, onProgress) {
  return discoverMarketOptional().then(function (discovery) {
    if (!discovery) return null
    return fetch(discovery.endpoints.updates, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ packageName: PACKAGE_NAME, ...(force ? { force: true } : {}) }),
    }).then(function (r) {
      return r.json().then(function (data) {
        if (r.status !== 202 || !data || !data.operation) {
          var fail = (data && data.failure) || {}
          var t = getT()
          var err = new Error(fail.message || (data && data.error) || t('update.selfUpdate.marketStartFailed'))
          err.code = fail.code
          err.retryable = fail.retryable === true
          throw err
        }
        return waitMarketOperation(discovery, data.operation.operationId, onProgress).then(
          function (op) {
            return { channel: 'market', discovery: discovery, op: op }
          },
        )
      })
    })
  })
}

function formatInstalledVersionSuffix(target) {
  if (!target) return ''
  return getT()('update.selfUpdate.pluginManagerSuccessVersionSuffix', { version: target })
}

/**
 * @param {object} info from checkSelfUpdate()
 * @param {object|null} ctx cordis client context
 * @param {{ force?: boolean, onProgress?: (msg: string) => void }} [opts]
 */
export function applySelfUpdate(info, ctx, opts) {
  var options = opts || {}
  var onProgress = options.onProgress
  var force = options.force === true
  var target = (info && info.latestVersion) || null
  var spec =
    (info && info.applyHint && info.applyHint.pluginManagerSpec) ||
    (target ? PACKAGE_NAME + '@' + target : PACKAGE_NAME)

  function progress(msg) {
    if (typeof onProgress === 'function') onProgress(msg)
  }

  var pm = resolvePluginManager(ctx)
  if (pm) {
    progress(getT()('update.selfUpdate.installingViaPluginManager', { spec: spec }))
    return Promise.resolve()
      .then(function () {
        return pm.installBundle(spec, { activate: true })
      })
      .then(function (raw) {
        var t = getT()
        var unwrapped = unwrapRemote(raw)
        if (!unwrapped.ok) {
          throw new Error(unwrapped.error || t('update.selfUpdate.pluginManagerInstallFailed'))
        }
        var value = unwrapped.value || {}
        if (value.application === 'cancelled') {
          throw new Error(t('update.selfUpdate.cancelled'))
        }
        if (value.ok === false) {
          throw new Error(value.error || t('update.selfUpdate.installNotSuccessful'))
        }
        return {
          ok: true,
          channel: 'pluginManager',
          installedVersion: target,
          message: t('update.selfUpdate.pluginManagerSuccess', {
            version: formatInstalledVersionSuffix(target),
          }),
          restartRequired: true,
          canRestartViaMarket: false,
        }
      })
      .catch(function (err) {
        var t = getT()
        // Fall through to optional market / manual guide.
        progress(
          t('update.selfUpdate.pluginManagerFallback', { message: err.message || String(err) }),
        )
        return applyViaMarket(force, function (op) {
          if (!op) return
          if (op.state === 'queued') progress(t('update.selfUpdate.marketQueued'))
          else if (op.state === 'running') {
            var p = op.progress || {}
            if (p.percent != null) progress(t('update.selfUpdate.marketUpdatingPercent', { percent: p.percent }))
            else progress(t('update.selfUpdate.marketUpdating'))
          }
        }).then(function (marketResult) {
          if (!marketResult) {
            return {
              ok: false,
              channel: 'manual',
              message: manualGuide(info),
              guide: manualGuide(info),
            }
          }
          var op = marketResult.op
          if (op.state === 'succeeded') {
            return {
              ok: true,
              channel: 'market',
              installedVersion: op.installedVersion || target,
              message: t('update.selfUpdate.marketSuccess', {
                version: op.installedVersion || target || '?',
              }),
              restartRequired: !!(op.outcome && op.outcome.restartRequired),
              canRestartViaMarket: !!(
                marketResult.discovery && marketResult.discovery.canRestart
              ),
              discovery: marketResult.discovery,
              failure: null,
            }
          }
          var failure = op.failure || {}
          return {
            ok: false,
            channel: 'market',
            message: failure.message || t('update.selfUpdate.updateFailed'),
            failure: failure,
            guide: manualGuide(info),
            canForce: failure.code === 'RELEASE_TOO_FRESH' || failure.code === 'VERSION_UNCHANGED',
          }
        })
      })
  }

  return applyViaMarket(force, function (op) {
    if (!op) return
    if (op.state === 'running') progress(getT()('update.selfUpdate.marketUpdating'))
  }).then(function (marketResult) {
    var t = getT()
    if (!marketResult) {
      return {
        ok: false,
        channel: 'manual',
        message: manualGuide(info),
        guide: manualGuide(info),
      }
    }
    var op = marketResult.op
    if (op.state === 'succeeded') {
      return {
        ok: true,
        channel: 'market',
        installedVersion: op.installedVersion || target,
        message: t('update.selfUpdate.marketSuccess', {
          version: op.installedVersion || target || '?',
        }),
        restartRequired: !!(op.outcome && op.outcome.restartRequired),
        canRestartViaMarket: !!(marketResult.discovery && marketResult.discovery.canRestart),
        discovery: marketResult.discovery,
      }
    }
    var failure = op.failure || {}
    return {
      ok: false,
      channel: 'market',
      message: failure.message || t('update.selfUpdate.updateFailed'),
      failure: failure,
      guide: manualGuide(info),
      canForce: failure.code === 'RELEASE_TOO_FRESH' || failure.code === 'VERSION_UNCHANGED',
    }
  })
}

export function forceRetryable(code) {
  return code === 'RELEASE_TOO_FRESH' || code === 'VERSION_UNCHANGED'
}
