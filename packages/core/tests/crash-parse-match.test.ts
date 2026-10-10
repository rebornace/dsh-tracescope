import { describe, expect, it } from 'vitest'
import { parseStackText } from '../src/crash/parse-stack.js'
import { matchStackToRepo } from '../src/crash/match-repo.js'
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('parseStackText', () => {
  it('parses Android/Kotlin frames', () => {
    const text = `java.lang.NullPointerException: msg
	at com.example.app.LoginActivity.onCreate(LoginActivity.kt:88)
	at android.app.Activity.performCreate(Activity.java:8000)`
    const parsed = parseStackText(text)
    expect(parsed.exceptionName).toBe('java.lang.NullPointerException')
    expect(parsed.frames.some((f) => f.fileName === 'LoginActivity.kt' && f.line === 88)).toBe(true)
  })
})

describe('matchStackToRepo', () => {
  it('matches file name under repo', async () => {
    const root = await mkdtemp(join(tmpdir(), 'crash-match-'))
    await mkdir(join(root, 'app/src/main/java/com/example'), { recursive: true })
    await writeFile(join(root, 'app/src/main/java/com/example/LoginActivity.kt'), 'class LoginActivity\n', 'utf8')
    const parsed = parseStackText(
      'java.lang.NPE\n\tat com.example.LoginActivity.onCreate(LoginActivity.kt:88)',
    )
    const hits = await matchStackToRepo(root, parsed, 10)
    expect(hits[0]?.path.replace(/\\/g, '/')).toContain('LoginActivity.kt')
  })
})
