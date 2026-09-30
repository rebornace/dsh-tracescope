import { describe, expect, it } from 'vitest'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { heuristicCompare } from '../src/design/heuristic-compare.js'
import type { DesignDoc } from '../src/design/types.js'
import type { CodePage } from '../src/design/adapters/adapter-types.js'

describe('heuristicCompare', () => {
  it('flags design text missing from Compose source', async () => {
    const dir = path.join(tmpdir(), `hc-${Date.now()}`)
    await mkdir(dir, { recursive: true })
    const file = path.join(dir, 'Screen.kt')
    await writeFile(
      file,
      `
@Composable
fun Screen() {
  Text("已有文案")
  Button(onClick = {}) { Text("按钮") }
}
`,
      'utf8',
    )

    const design: DesignDoc = {
      scale: 1,
      source: 'manual',
      root: {
        id: 'root',
        name: 'screen',
        kind: 'frame',
        box: { x: 0, y: 0, width: 100, height: 200 },
        style: {},
        children: [
          {
            id: 't1',
            name: 'title',
            kind: 'text',
            text: '缺失文案',
            box: { x: 10, y: 10, width: 80, height: 20 },
            style: {},
            children: [],
          },
          {
            id: 't2',
            name: 'ok',
            kind: 'text',
            text: '已有文案',
            box: { x: 10, y: 40, width: 80, height: 20 },
            style: {},
            children: [],
          },
        ],
      },
    }

    const page: CodePage = {
      adapterId: 'android-compose',
      platform: 'android',
      kindLabel: 'Jetpack Compose',
      relativePath: 'Screen.kt',
      absolutePath: file,
      precise: false,
      fingerprint: { texts: ['已有文案', '按钮'], nameTokens: ['screen'], controlCount: 3 },
    }

    const result = await heuristicCompare(design, page)
    expect(result.diffs.some((d) => d.property === 'text' && d.designNodeId === 't1')).toBe(true)
    expect(result.diffs.some((d) => d.designNodeId === 't2')).toBe(false)
    expect(result.comparedPairs).toBeGreaterThanOrEqual(1)
  })
})
