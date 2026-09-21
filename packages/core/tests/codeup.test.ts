import { describe, expect, it } from 'vitest'
import {
  analyzeCodeupImpact,
  changedPathsFromDiffs,
  parseCodeupRemote,
  type CodeupDiffFile,
} from '../src/codeup.js'

describe('codeup remote parse', () => {
  it('reads organization id and repository path from a Codeup URL', () => {
    expect(
      parseCodeupRemote('https://codeup.aliyun.com/5f2a9b67df9df74e36afc7da/allcpp/CPP_iOS.git'),
    ).toEqual({
      organizationId: '5f2a9b67df9df74e36afc7da',
      repositoryId: '5f2a9b67df9df74e36afc7da/allcpp/CPP_iOS',
    })
  })

  it('rejects non-codeup urls', () => {
    expect(parseCodeupRemote('https://github.com/org/repo.git')).toBeNull()
  })
})

describe('codeup compare checklist', () => {
  it('keeps deleted paths and skips empty rows', () => {
    const diffs: CodeupDiffFile[] = [
      {
        oldPath: 'a.kt',
        newPath: 'a.kt',
        diff: 'diff',
        deletedFile: false,
        newFile: false,
        renamedFile: false,
        isBinary: false,
      },
      {
        oldPath: 'gone.kt',
        newPath: 'gone.kt',
        diff: '',
        deletedFile: true,
        newFile: false,
        renamedFile: false,
        isBinary: false,
      },
    ]
    expect(changedPathsFromDiffs(diffs)).toEqual(['a.kt', 'gone.kt'])
  })

  it('builds a direct checklist from the compare API without git', async () => {
    const report = await analyzeCodeupImpact({
      remote: 'https://codeup.aliyun.com/5f2a9b67df9df74e36afc7da/allcpp/CPP_iOS.git',
      baseCommit: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      headCommit: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      token: 'pt-test',
      fetchImpl: (async (url: string) => {
        expect(String(url)).toContain('/compares?')
        expect(String(url)).toContain('straight=false')
        return {
          ok: true,
          text: async () =>
            JSON.stringify({
              commits: [],
              diffs: [
                {
                  oldPath: 'ios/Pay/PayViewController.m',
                  newPath: 'ios/Pay/PayViewController.m',
                  diff: '@@ -1 +1 @@\n-old\n+new\n',
                  deletedFile: false,
                  newFile: false,
                  isBinary: false,
                },
              ],
            }),
        } as Response
      }) as typeof fetch,
    })
    expect(report.ripple).toEqual([])
    expect(report.changedFiles).toEqual(['ios/Pay/PayViewController.m'])
    expect(report.direct.length).toBe(1)
    expect(report.direct[0]?.evidence.some((e) => e.code === 'codeup_compare')).toBe(true)
  })
})
