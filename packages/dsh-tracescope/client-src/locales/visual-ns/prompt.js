/** @type {Record<string, string>} */
export default {
  'prompt.intro':
    '我正在做这个页面的 UI 走查：以设计稿为唯一准绳，对照代码实现在布局、尺寸、颜色、字体、间距上的差异。请协助我把实现改到贴近设计稿。',
  'prompt.designPage': '设计稿页面：{name}',
  'prompt.codeImpl': '代码实现（{platform}）：{path}',
  'prompt.defaultPlatform': 'Android XML',
  'prompt.viewport': '画板尺寸：{width} × {height}',
  'prompt.diffSummary':
    '当前静态对比与设计稿仍有 {count} 处不一致（供定位实现偏差，重点是据此改代码，而非仅解读差异）：',
  'prompt.noDeterministicDiffs': '（确定性对比未发现明显差异）',
  'prompt.diffLine':
    '{index}. [{severity}] {nodeName} · {property}：设计稿 {expected} / 当前渲染 {actual}{review}',
  'prompt.reviewSuffix': '（静态无法确定，需确认）',
  'prompt.assistIntro': '请按正常对话方式协助我完成走查修复：',
  'prompt.assistStep1':
    '1. 以设计稿为唯一准绳，针对上述不一致逐项给出如何改代码贴近设计稿的具体做法（尺寸 / 位置 / 间距 / 颜色 / 字号等）。',
  'prompt.assistStep2':
    '2. 对列表、分页、WebView 等运行时动态区域，在差异项中标明不确定性，并给出设计稿期望内容（不必做可视化还原）。',
  'prompt.assistStep3':
    '3. 区分哪些是可直接修正的实现问题，哪些受运行时数据或字体回退影响、需要我确认；有疑问随时问我，我们连续完善。',
}
