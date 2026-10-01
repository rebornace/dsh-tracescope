import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { androidComposeAdapter } from '../src/design/adapters/android-compose.js'
import { iosSwiftuiAdapter } from '../src/design/adapters/ios-swiftui.js'
import {
  clearDiscoverPagesCache,
  discoverAllPages,
  resolveCodePage,
} from '../src/design/index.js'

const dirs: string[] = []
async function makeRoot(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'locator-'))
  dirs.push(dir)
  return dir
}

afterEach(async () => {
  clearDiscoverPagesCache()
  while (dirs.length) {
    const dir = dirs.pop()!
    await rm(dir, { recursive: true, force: true })
  }
})

describe('android-compose locator', () => {
  it('only treats files with @Composable as pages', async () => {
    const root = await makeRoot()
    const uiDir = path.join(root, 'app/src/main/java/com/example/login')
    await mkdir(uiDir, { recursive: true })
    await writeFile(
      path.join(uiDir, 'LoginScreen.kt'),
      [
        'package com.example.login',
        '',
        '@Composable',
        'fun LoginScreen() {',
        '    Text("登录")',
        '    Button(onClick = {}) { Text("注册") }',
        '}',
      ].join('\n'),
    )
    // A plain Kotlin file (no composable) must be ignored.
    await writeFile(
      path.join(uiDir, 'Models.kt'),
      'package com.example.login\n\ndata class User(val name: String)\n',
    )

    const pages = await androidComposeAdapter.discoverPages(root)
    expect(pages).toHaveLength(1)
    const page = pages[0]!
    expect(page.precise).toBe(true)
    expect(page.kindLabel).toBe('Jetpack Compose')
    expect(page.relativePath).toMatch(/LoginScreen\.kt$/)
    expect(page.fingerprint.texts).toContain('登录')
    expect(page.fingerprint.texts).toContain('注册')
    expect(page.fingerprint.nameTokens).toContain('loginscreen')
    expect(page.fingerprint.controlCount).toBeGreaterThan(0)
  })
})

describe('ios-swiftui locator', () => {
  it('only treats files declaring a View conformance as pages', async () => {
    const root = await makeRoot()
    const dir = path.join(root, 'App/Views')
    await mkdir(dir, { recursive: true })
    await writeFile(
      path.join(dir, 'LoginView.swift'),
      [
        'import SwiftUI',
        '',
        'struct LoginView: View {',
        '    var body: some View {',
        '        Text("登录")',
        '        Button("注册") {}',
        '    }',
        '}',
      ].join('\n'),
    )
    // Helper type: not a View -> ignored.
    await writeFile(
      path.join(dir, 'Theme.swift'),
      'struct Theme {\n    let color: String\n}\n',
    )

    const pages = await iosSwiftuiAdapter.discoverPages(root)
    expect(pages).toHaveLength(1)
    const page = pages[0]!
    expect(page.precise).toBe(true)
    expect(page.kindLabel).toBe('SwiftUI')
    expect(page.fingerprint.texts).toContain('登录')
    expect(page.fingerprint.nameTokens).toContain('loginview')
  })
})

describe('discoverAllPages across adapters', () => {
  it('finds mixed android-xml + compose pages in one project', async () => {
    const root = await makeRoot()
    const layoutDir = path.join(root, 'app/src/main/res/layout')
    await mkdir(layoutDir, { recursive: true })
    await writeFile(
      path.join(layoutDir, 'login.xml'),
      [
        '<?xml version="1.0" encoding="utf-8"?>',
        '<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android">',
        '    <TextView android:text="登录" />',
        '</LinearLayout>',
      ].join('\n'),
    )
    const composeDir = path.join(root, 'app/src/main/java/com/example')
    await mkdir(composeDir, { recursive: true })
    await writeFile(
      path.join(composeDir, 'LoginScreen.kt'),
      '@Composable\nfun LoginScreen() {\n  Text("登录")\n}\n',
    )

    const pages = await discoverAllPages(root)
    const adapters = new Set(pages.map((p) => p.adapterId))
    expect(adapters.has('android-xml')).toBe(true)
    expect(adapters.has('android-compose')).toBe(true)
  })
})

describe('resolveCodePage', () => {
  it('resolves a precise page without requiring a prior full discover', async () => {
    const root = await makeRoot()
    const layoutDir = path.join(root, 'app/src/main/res/layout')
    await mkdir(layoutDir, { recursive: true })
    const rel = 'app/src/main/res/layout/login.xml'
    await writeFile(
      path.join(root, rel),
      [
        '<?xml version="1.0" encoding="utf-8"?>',
        '<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"',
        '    android:layout_width="match_parent"',
        '    android:layout_height="match_parent">',
        '  <TextView android:text="登录" android:layout_width="wrap_content" android:layout_height="wrap_content"/>',
        '</LinearLayout>',
      ].join('\n'),
    )

    const page = await resolveCodePage(root, 'android-xml', rel)
    expect(page).toBeTruthy()
    expect(page!.adapterId).toBe('android-xml')
    expect(page!.precise).toBe(true)
    expect(page!.relativePath).toBe(rel.replace(/\\/g, '/'))
    expect(page!.absolutePath).toContain('login.xml')
  })

  it('returns undefined when the file is missing', async () => {
    const root = await makeRoot()
    const page = await resolveCodePage(root, 'android-xml', 'missing/layout.xml')
    expect(page).toBeUndefined()
  })

  it('reuses discover cache when available', async () => {
    const root = await makeRoot()
    const layoutDir = path.join(root, 'app/src/main/res/layout')
    await mkdir(layoutDir, { recursive: true })
    const rel = 'app/src/main/res/layout/cached.xml'
    await writeFile(
      path.join(root, rel),
      [
        '<?xml version="1.0" encoding="utf-8"?>',
        '<FrameLayout xmlns:android="http://schemas.android.com/apk/res/android"',
        '    android:layout_width="match_parent"',
        '    android:layout_height="match_parent"/>',
      ].join('\n'),
    )

    const discovered = await discoverAllPages(root)
    const fromDiscover = discovered.find(
      (p) => p.adapterId === 'android-xml' && p.relativePath === rel,
    )
    expect(fromDiscover).toBeTruthy()

    const resolved = await resolveCodePage(root, 'android-xml', rel)
    expect(resolved?.fingerprint.controlCount).toBe(fromDiscover!.fingerprint.controlCount)
  })
})
