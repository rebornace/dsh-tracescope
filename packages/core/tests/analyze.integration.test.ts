import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { analyzeImpact } from '../src/analyze.js'
import { exportReportMarkdown } from '../src/export.js'

function git(cwd: string, args: string[]) {
  execFileSync('git', args, { cwd, stdio: 'pipe' })
}

describe('analyzeImpact integration', () => {
  it('builds direct + ripple scope from kotlin sources', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'tracescope-'))
    const pay = path.join(root, 'android/app/src/main/java/com/example/pay')
    const home = path.join(root, 'android/app/src/main/java/com/example/home')
    mkdirSync(pay, { recursive: true })
    mkdirSync(home, { recursive: true })

    writeFileSync(
      path.join(pay, 'PayActivity.kt'),
      `
package com.example.pay
class PayActivity {
  fun onCreate() { setTitle("支付收银台") }
}
`,
    )
    writeFileSync(
      path.join(home, 'HomeActivity.kt'),
      `
package com.example.home
import com.example.pay.PayActivity
class HomeActivity {
  fun openPay() { /* uses PayActivity */ }
}
`,
    )

    git(root, ['init'])
    git(root, ['config', 'user.email', 'test@example.com'])
    git(root, ['config', 'user.name', 'Test'])
    git(root, ['add', '.'])
    git(root, ['commit', '-m', 'base'])
    const base = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim()

    writeFileSync(
      path.join(pay, 'PayActivity.kt'),
      `
package com.example.pay
class PayActivity {
  fun onCreate() { setTitle("支付收银台") }
  fun pay() { /* changed */ }
}
`,
    )
    git(root, ['add', '.'])
    git(root, ['commit', '-m', 'change pay'])
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim()

    return analyzeImpact({
      repoPath: root,
      baseCommit: base,
      headCommit: head,
      rippleDepth: 2,
      modulesConfig: {
        modules: [{ match: 'com/example/pay*', name: '支付收银台', risk: 'high' }],
      },
    }).then((report) => {
      expect(report.changedFiles.some((f) => f.includes('PayActivity.kt'))).toBe(true)
      expect(report.direct.some((i) => i.displayName.includes('支付'))).toBe(true)
      const md = exportReportMarkdown(report)
      expect(md).toContain('支付')
      // Home imports Pay — should ripple if reverse index linked PayActivity stem
      const rippledHome = report.ripple.some((i) =>
        i.files.some((f) => f.includes('HomeActivity.kt')),
      )
      expect(rippledHome).toBe(true)
    })
  })
})
