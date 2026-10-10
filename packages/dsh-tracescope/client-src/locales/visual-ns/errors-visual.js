/** @type {Record<string, string>} */
export default {
  'errors.thumbBatchFailed': '缩略图批量请求失败',
  'errors.nonJson': '服务器返回非 JSON（HTTP {status}）：{snippet}',
  'errors.httpFailed': '请求失败（HTTP {status}）',
  'errors.http405':
    '请求失败（HTTP 405）：插件路由未加载或方法不匹配，请完全退出并重启 DeepSeek Harness 后再试',
  'errors.cannotWriteChat': '无法写入会话输入框',
  'errors.imageProxyFailed': '图片代理失败',
  'errors.designImageLoadFailed': '设计稿图片加载失败',
  'errors.requestFailed': '请求失败',
  'visual.title': '设计差异分析',
  'visual.experimental': '试验',
  'visual.intro':
    '对照设计稿与代码实现，列出布局 / 样式 / 文案等差异（试验功能，结果请人工复核）。支持 Figma 与 蓝湖：粘贴设计稿链接与访问凭证后扫描。Figma 填 Personal Access Token；蓝湖填浏览器 Cookie（登录 lanhuapp.com 后从 DevTools 复制）。链接带页面定位（Figma node-id / 蓝湖 image_id）时优先该页；否则扫描整个文件/项目。链接与凭证会自动记住；常用链接可点选或删除。再对卡片做「界面对比」或「AI 协助分析」。',
  'visual.designLinkLabel': '设计稿链接',
  'visual.designLinkPlaceholder':
    'Figma 或蓝湖链接，如 https://lanhuapp.com/web/#/item/project/detailDetach?...',
  'visual.saveLink': '保存',
  'visual.saveLinkTitle': '保存到常用链接',
  'visual.deleteLink': '删除',
  'visual.clearLinkTitle': '清空当前链接',
  'visual.savedLinksHeading': '常用设计稿链接',
  'visual.removeSavedLinkTitle': '从常用列表删除',
  'visual.lanhuCookie': '蓝湖 Cookie',
  'visual.figmaToken': 'Figma Token',
  'visual.lanhuCookiePlaceholder': '从浏览器 DevTools → Network 请求头复制 Cookie',
  'visual.figmaTokenPlaceholder': 'figd_…（与蓝湖 Cookie 分开保存）',
  'visual.clearLanhuCookieTitle': '清除已保存的蓝湖 Cookie',
  'visual.clearFigmaTokenTitle': '清除已保存的 Figma Token',
  'visual.clearCredential': '清除',
  'visual.deepEnrichmentTitle': '适配器深度增强',
  'visual.deepEnrichmentBody':
    '（在通用属性级对比之上，启用各栈已注册的增强能力，如布局引擎、动态区域还原等；关闭则全栈统一走属性级静态解析，更快、结果粒度更一致）',
  'visual.workflowHint':
    '「界面对比」生成设计对照图与静态差异清单；「AI 协助分析」补充/纠正差异项并写回下方清单（不做代码 UI 还原预览）。蓝湖若自动匹配为空，需先在卡片上「指定代码文件」再点对比。',
  'visual.busy.scanDesign': '正在扫描设计稿…',
  'visual.busy.regenerateCompare': '正在重新生成界面对比…',
  'visual.busy.compare': '正在对比设计稿与代码，并生成标注…',
  'visual.error.compareDoneNoRaster':
    '界面对比已完成，但设计稿官方渲染图加载失败。后续「AI 协助分析」缺少设计图会明显影响效果，请检查设计稿链接/凭证后重试「界面对比」。',
  'visual.confirm.noCompareYet':
    '尚未对该页完成「界面对比」。\n\n继续将先生成界面对比（可能需要几十秒到数分钟），再准备 AI 分析提示词；整体耗时与 token 消耗都会更高。\n\n若设计稿渲染图加载失败，分析质量会明显下降。\n\n是否仍要继续？',
  'visual.error.aiAnalyzeCancelled':
    '已取消 AI 协助分析。建议先点「界面对比」，确认设计稿渲染成功后再分析。',
  'visual.busy.preparingAi': '正在准备 AI 协助分析…',
  'visual.busy.compareThenAi': '正在生成界面对比，随后准备 AI 协助分析…',
  'visual.error.compareFailedAbort':
    '界面对比失败，已中止 AI 协助分析，避免无效 token 消耗。\n原因：{reason}',
  'visual.confirm.noRaster':
    '设计稿官方渲染图加载失败（或尚未可用）。\n\n没有渲染图时，AI 只能依赖结构/文案差异，结论容易不准，但仍会消耗 token。\n\n建议先检查设计稿链接与凭证，重新「界面对比」成功后再分析。\n\n是否仍要继续？',
  'visual.error.cancelNeedRaster':
    '已取消：请先确认设计稿渲染图可加载（界面对比左侧出现设计图），再使用「AI 协助分析」。',
  'visual.confirm.promptNoRaster':
    '准备提示词时仍未拿到设计稿渲染图。继续发送可能导致效果差且浪费 token。\n\n是否仍要填入会话？',
  'visual.error.cancelPrompt': '已取消填入提示词。请修复设计稿渲染后再试。',
  'visual.error.cannotPrepareAi': '无法准备 AI 协助分析，请重试。',
  'visual.error.chatWriteSuffix': '；请确认已打开并选中一个会话，或重新点击「AI 协助分析」。',
  'visual.error.rematchChatWriteSuffix':
    '；请确认已打开并选中一个会话，核对提示词后再发送。写回后侧栏会自动更新选中文件。',
  'visual.success.aiPromptSent':
    '✓ 已打开界面对比，并把「AI 协助分析」提示词填入当前会话。请核对后发送；写回后结论会出现在下方差异区。',
  'visual.success.aiPromptSentNoRaster':
    '✓ 提示词已填入会话（注意：当前无设计稿渲染图，分析结果可能不准）。请核对后再发送。',
  'visual.busy.preparingRematch': '正在准备「AI 推荐文件」提示词…',
  'visual.error.needCredentials': '请先填写设计稿链接与访问凭证（Figma Token 或蓝湖 Cookie）',
  'visual.error.cannotPrepareRematch': '无法准备推荐提示词，请重试。',
  'visual.success.rematchPrompt':
    '✓ 已将「AI 推荐文件」提示词填入当前会话。请核对后发送；模型调用 tracescope_publish_page_rematch 后，侧栏会自动选中推荐文件。可继续对话纠正并再次写回。',
  'visual.currentCompare': '当前对比：{name}',
  'visual.currentCompareFiles': '设计稿 ↔ 代码文件：{path}',
  'visual.error.noDesignNode': '无法确定当前设计节点，请重新进行界面对比。',
  'visual.error.noPage': '无法确定当前页面，请重新进行界面对比。',
  'visual.label.lanhuPage': '蓝湖 · {id}',
  'visual.label.lanhuProject': '蓝湖项目 · {id}',
  'visual.label.lanhuDesign': '蓝湖设计稿',
  'visual.success.fileRematchWriteback':
    '✓ AI 已写回文件推荐（{path}）。可在会话继续纠正后再次写回。',
  'visual.layer.dynamicRegion': '运行时动态区域',
  'visual.layer.aiRestore': 'AI 还原',
  'visual.layer.designRestore': '设计稿还原',
  'visual.layer.aiInferred': 'AI 推断{suffix}',
  'visual.layer.aiInferredSuffix': '：{note}',
}
