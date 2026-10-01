import { describe, expect, it } from 'vitest'
import { isIndexedSource } from '../src/deps.js'

describe('isIndexedSource path filters', () => {
  it('indexes normal application sources', () => {
    expect(isIndexedSource('src/views/Pay.tsx')).toBe(true)
    expect(isIndexedSource('android/app/src/main/java/com/ex/PayActivity.kt')).toBe(true)
    expect(isIndexedSource('lib/cart/cart_repo.dart')).toBe(true)
  })

  it('skips dependency and build directories in git trees', () => {
    expect(isIndexedSource('node_modules/lodash/index.js')).toBe(false)
    expect(isIndexedSource('packages/app/node_modules/vue/dist/vue.js')).toBe(false)
    expect(isIndexedSource('ios/Pods/Alamofire/Source/AF.swift')).toBe(false)
    expect(isIndexedSource('web/.next/server/app.js')).toBe(false)
    expect(isIndexedSource('target/classes/App.java')).toBe(false)
    expect(isIndexedSource('dist/bundle.js')).toBe(false)
    expect(isIndexedSource('miniprogram_npm/@vant/button/index.js')).toBe(false)
  })

  it('skips minified and snapshot artifacts', () => {
    expect(isIndexedSource('vendor/jquery.min.js')).toBe(false)
    expect(isIndexedSource('public/app.bundle.js')).toBe(false)
    expect(isIndexedSource('src/__tests__/Pay.test.tsx.snap')).toBe(false)
  })
})
