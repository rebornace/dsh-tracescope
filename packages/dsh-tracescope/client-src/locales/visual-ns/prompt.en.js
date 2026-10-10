/** @type {Record<string, string>} */
export default {
  'prompt.intro':
    'I am doing a UI review for this page: design is the source of truth. Compare implementation vs design and help align code with the design.',
  'prompt.designPage': 'Design page: {name}',
  'prompt.codeImpl': 'Implementation ({platform}): {path}',
  'prompt.defaultPlatform': 'Android XML',
  'prompt.viewport': 'Artboard: {width} × {height}',
  'prompt.diffSummary': 'Static compare still shows {count} mismatches vs design:',
  'prompt.noDeterministicDiffs': '(No obvious deterministic diffs)',
  'prompt.diffLine':
    '{index}. [{severity}] {nodeName} · {property}: design {expected} / render {actual}{review}',
  'prompt.reviewSuffix': ' (static uncertain — confirm)',
  'prompt.assistIntro': 'Please help fix via normal conversation:',
  'prompt.assistStep1': '1. Design is truth — for each mismatch, say how to change code.',
  'prompt.assistStep2': '2. For dynamic regions, mark uncertainty and state design expectation.',
  'prompt.assistStep3': '3. Separate fixable issues from cases needing my confirmation.',
}
