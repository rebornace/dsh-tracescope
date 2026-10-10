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

  it('keeps exceptionName when no stack frames parse', () => {
    const parsed = parseStackText('java.lang.IllegalStateException: bad\nnot a stack line')
    expect(parsed.frames).toEqual([])
    expect(parsed.exceptionName).toBe('java.lang.IllegalStateException')
    expect(parsed.message).toBe('bad')
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

  it('does not match same basename under node_modules', async () => {
    const root = await mkdtemp(join(tmpdir(), 'crash-match-'))
    await mkdir(join(root, 'src'), { recursive: true })
    await mkdir(join(root, 'node_modules', 'pkg'), { recursive: true })
    await writeFile(join(root, 'src', 'Foo.kt'), 'class Foo\n', 'utf8')
    await writeFile(join(root, 'node_modules', 'pkg', 'Foo.kt'), 'class Foo\n', 'utf8')
    const parsed = parseStackText('java.lang.NPE\n\tat com.app.Foo.bar(Foo.kt:1)')
    const hits = await matchStackToRepo(root, parsed, 10)
    expect(hits).toHaveLength(1)
    const normalized = hits[0]!.path.replace(/\\/g, '/')
    expect(normalized).toContain('/src/')
    expect(normalized).not.toContain('node_modules')
  })

  it('respects limit across multiple file hits', async () => {
    const root = await mkdtemp(join(tmpdir(), 'crash-match-'))
    await mkdir(join(root, 'pkg/a'), { recursive: true })
    await mkdir(join(root, 'pkg/b'), { recursive: true })
    await writeFile(join(root, 'pkg/a', 'A.kt'), 'class A\n', 'utf8')
    await writeFile(join(root, 'pkg/b', 'B.kt'), 'class B\n', 'utf8')
    const parsed = parseStackText(
      `java.lang.NPE
\tat com.a.A.one(A.kt:1)
\tat com.b.B.two(B.kt:2)`,
    )
    const hits = await matchStackToRepo(root, parsed, 1)
    expect(hits).toHaveLength(1)
  })

  it('picks next candidate when best path already used', async () => {
    const root = await mkdtemp(join(tmpdir(), 'crash-match-'))
    await mkdir(join(root, 'app/com/example'), { recursive: true })
    await mkdir(join(root, 'other/com/example'), { recursive: true })
    await writeFile(join(root, 'app/com/example/LoginActivity.kt'), 'class LoginActivity\n', 'utf8')
    await writeFile(join(root, 'other/com/example/LoginActivity.kt'), 'class LoginActivity\n', 'utf8')
    const parsed = parseStackText(
      `java.lang.NPE
\tat com.example.LoginActivity.onCreate(LoginActivity.kt:1)
\tat com.example.LoginActivity.onResume(LoginActivity.kt:2)`,
    )
    const hits = await matchStackToRepo(root, parsed, 10)
    expect(hits).toHaveLength(2)
    const paths = hits.map((h) => h.path.replace(/\\/g, '/'))
    expect(new Set(paths).size).toBe(2)
  })
})
