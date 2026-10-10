/**
 * React hook: live `t` that re-renders when Host locale changes.
 */
import { useEffect, useState } from 'react'
import { getLocaleRevision, getT, subscribeLocale } from './i18n.js'

export function useLocaleT() {
  var _rev = useState(getLocaleRevision)
  var setRev = _rev[1]
  useEffect(function () {
    return subscribeLocale(function () {
      setRev(getLocaleRevision())
    })
  }, [])
  return getT()
}
