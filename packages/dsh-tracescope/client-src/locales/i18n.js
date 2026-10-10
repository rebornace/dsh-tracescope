/**
 * TraceScope client i18n helpers.
 *
 * Soft-depends on Host `ctx.locale` (never hard-inject — missing peer aborts
 * activation). Register dictionaries once; follow language switches via
 * `locale/change` only. Do NOT re-register inside LocaleFace.subscribe —
 * registrations bump revision and would infinite-loop the UI thread.
 */
import zh from './zh.js'
import en from './en.js'

export var LOCALE_NS = 'tracescope'
export { zh, en }

var fallbackT = null
var boundT = null
var hostBind = null
var hostCtx = null
var dictsRegistered = false
var revision = 0
var listeners = []
var lastActive = ''

function notify() {
  revision += 1
  for (var i = 0; i < listeners.length; i++) {
    try {
      listeners[i]()
    } catch (_e) {}
  }
}

/** Subscribe to active-locale changes (React re-render hook). */
export function subscribeLocale(fn) {
  if (typeof fn !== 'function') return function () {}
  listeners.push(fn)
  return function () {
    listeners = listeners.filter(function (x) {
      return x !== fn
    })
  }
}

export function getLocaleRevision() {
  return revision
}

function resolveLocaleService(ctx) {
  var c = ctx || hostCtx
  if (!c) return null
  try {
    if (c.locale && typeof c.locale.bind === 'function') return c.locale
  } catch (_e) {}
  try {
    if (typeof c.get === 'function') {
      var viaGet = c.get('locale')
      if (viaGet && typeof viaGet.bind === 'function') return viaGet
    }
  } catch (_e2) {}
  return null
}

function resolveFallbackLocale() {
  try {
    if (typeof document !== 'undefined') {
      var docLang = String(
        (document.documentElement && document.documentElement.lang) ||
          (document.body && document.body.lang) ||
          '',
      ).toLowerCase()
      if (docLang === 'en' || docLang.startsWith('en-')) return 'en'
      if (docLang === 'zh' || docLang.startsWith('zh-')) return 'zh'
    }
  } catch (_e) {}
  try {
    var lang = String((typeof navigator !== 'undefined' && navigator.language) || 'zh').toLowerCase()
    if (lang === 'en' || lang.startsWith('en-')) return 'en'
  } catch (_e2) {}
  return 'zh'
}

function interpolate(template, params) {
  if (!params || typeof template !== 'string') return template
  return template.replace(/\{(\w+)\}/g, function (_m, key) {
    return params[key] !== undefined && params[key] !== null ? String(params[key]) : '{' + key + '}'
  })
}

function makeDictTranslator(locale) {
  var dict = locale === 'en' ? en : zh
  var fallback = zh
  return function t(key, params) {
    var raw = dict[key] !== undefined ? dict[key] : fallback[key] !== undefined ? fallback[key] : key
    return interpolate(raw, params)
  }
}

function activeFromService(locale) {
  try {
    if (locale && typeof locale.getLocale === 'function') {
      var snap = locale.getLocale()
      if (snap && snap.active) {
        var a = String(snap.active).toLowerCase()
        if (a === 'en' || a.startsWith('en-')) return 'en'
        return 'zh'
      }
    }
  } catch (_e) {}
  return resolveFallbackLocale()
}

function makeLiveTranslator(ctx) {
  return function t(key, params) {
    var locale = resolveLocaleService(ctx)
    if (locale && typeof locale.bind === 'function') {
      try {
        if (!hostBind || hostBind.__tracescopeNs !== LOCALE_NS) {
          hostBind = locale.bind(LOCALE_NS)
          hostBind.__tracescopeNs = LOCALE_NS
        }
        return hostBind(key, params)
      } catch (_e) {
        return makeDictTranslator(activeFromService(locale))(key, params)
      }
    }
    return makeDictTranslator(resolveFallbackLocale())(key, params)
  }
}

/** Build a translator; prefers Host bind, else navigator/document fallback. */
export function createTranslator(ctx) {
  if (ctx) hostCtx = ctx
  var t = makeLiveTranslator(ctx)
  boundT = t
  fallbackT = t
  return t
}

function registerOn(locale) {
  if (!locale || typeof locale.register !== 'function') return function () {}
  try {
    var disposeZh = locale.register(LOCALE_NS, 'zh', zh)
    var disposeEn = locale.register(LOCALE_NS, 'en', en)
    dictsRegistered = true
    return function () {
      dictsRegistered = false
      try {
        if (typeof disposeZh === 'function') disposeZh()
      } catch (_e) {}
      try {
        if (typeof disposeEn === 'function') disposeEn()
      } catch (_e2) {}
    }
  } catch (_e3) {
    try {
      var dispose = locale.register(LOCALE_NS, { zh: zh, en: en })
      dictsRegistered = true
      return function () {
        dictsRegistered = false
        try {
          if (typeof dispose === 'function') dispose()
        } catch (_e5) {}
      }
    } catch (_e4) {
      return function () {}
    }
  }
}

/** Register zh/en dictionaries on Host locale service. Returns disposer or noop. */
export function registerTracescopeLocales(ctx) {
  if (ctx) hostCtx = ctx
  if (dictsRegistered) return function () {}
  return registerOn(resolveLocaleService(ctx))
}

/**
 * Wire translator + one-shot dictionary registration.
 * Language switches: `locale/change` → invalidate bind + notify React.
 * Never re-register from LocaleFace.subscribe (revision feedback loop).
 */
export function wireTracescopeI18n(ctx) {
  if (!ctx) return function () {}
  hostCtx = ctx
  var disposeDict = function () {}
  var offChange = null
  var timer = null

  createTranslator(ctx)

  function ensureRegistered() {
    if (dictsRegistered) return false
    var locale = resolveLocaleService(ctx)
    if (!locale) return false
    disposeDict = registerOn(locale)
    hostBind = null
    createTranslator(ctx)
    lastActive = activeFromService(locale)
    return true
  }

  function onLocaleChange() {
    hostBind = null
    createTranslator(ctx)
    var locale = resolveLocaleService(ctx)
    var next = locale ? activeFromService(locale) : resolveFallbackLocale()
    if (next !== lastActive) {
      lastActive = next
      notify()
    }
  }

  ensureRegistered()

  try {
    if (typeof ctx.on === 'function') {
      offChange = ctx.on('locale/change', onLocaleChange)
    }
  } catch (_e) {}

  // Locale service may appear after us — poll lightly, register once, stop.
  if (!dictsRegistered) {
    var tries = 0
    timer = setInterval(function () {
      tries += 1
      if (ensureRegistered() || tries >= 20) {
        clearInterval(timer)
        timer = null
      }
    }, 500)
  }

  return function () {
    if (timer) clearInterval(timer)
    try {
      if (typeof offChange === 'function') offChange()
    } catch (_e4) {}
    try {
      disposeDict()
    } catch (_e6) {}
  }
}

/** Active locale id for Accept-Language headers etc. */
export function getActiveLocale(ctx) {
  var locale = resolveLocaleService(ctx || hostCtx)
  if (locale) return activeFromService(locale)
  return resolveFallbackLocale()
}

/** Headers so Host API responses follow the active UI language. */
export function localeHeaders(extra) {
  var lang = getActiveLocale() === 'en' ? 'en' : 'zh'
  var headers = Object.assign({ 'accept-language': lang }, extra || {})
  return headers
}

/** Merge `locale` into a JSON body for langFromBody(). */
export function withLocale(body) {
  var lang = getActiveLocale() === 'en' ? 'en' : 'zh'
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { locale: lang, value: body }
  }
  return Object.assign({}, body, { locale: lang })
}

/** Module-level t used after apply() wires createTranslator. */
export function getT() {
  return boundT || fallbackT || makeLiveTranslator(hostCtx)
}

export function setModuleTranslator(t) {
  boundT = t
  fallbackT = t
}
