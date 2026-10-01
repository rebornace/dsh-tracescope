import { describe, expect, it } from 'vitest'
import {
  enrichVisualFindingsNodeIds,
  extractCandidateNodeIds,
  resolveFindingNodeId,
  type FindingNodeLocator,
} from '../src/design/resolve-finding-node.js'

const nodes: FindingNodeLocator[] = [
  { id: '1:1', name: 'Screen', width: 390, height: 844 },
  { id: '12:345', name: '提交按钮', text: '提交', width: 120, height: 40 },
  { id: '12:400', name: '标题', text: '我的订单', width: 200, height: 28 },
  { id: '99:1', name: '列表卡片', width: 360, height: 120 },
]

describe('resolveFindingNodeId', () => {
  it('extracts figma-style ids from free text', () => {
    expect(extractCandidateNodeIds('见节点 12:345 与 12-400')).toEqual(
      expect.arrayContaining(['12:345', '12-345', '12-400', '12:400']),
    )
  })

  it('resolves exact nodeId with colon/dash variants', () => {
    expect(resolveFindingNodeId({ nodeId: '12-345', title: '圆角' }, nodes)).toBe('12:345')
  })

  it('resolves by expected text when nodeId missing', () => {
    expect(
      resolveFindingNodeId({ title: '文案不一致', expected: '我的订单' }, nodes),
    ).toBe('12:400')
  })

  it('resolves by location name', () => {
    expect(
      resolveFindingNodeId({ title: '按钮偏小', location: '提交按钮' }, nodes),
    ).toBe('12:345')
  })

  it('returns undefined when confidence is low', () => {
    expect(resolveFindingNodeId({ title: '某处不对', location: '未知区域' }, nodes)).toBeUndefined()
  })

  it('enriches findings in place for publish', () => {
    const out = enrichVisualFindingsNodeIds(
      [
        {
          title: '标题字号偏小',
          severity: 'medium',
          expected: '我的订单',
        },
        {
          title: '已有正确 id',
          severity: 'low',
          nodeId: '12:345',
        },
      ],
      nodes,
    )
    expect(out[0]!.nodeId).toBe('12:400')
    expect(out[1]!.nodeId).toBe('12:345')
  })
})
