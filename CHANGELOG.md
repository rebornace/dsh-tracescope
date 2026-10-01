# 更新日志 / Changelog

只记对使用者有影响的功能节点，不记文档编码、关键词之类的内部提交。  
安装请以 npm 上的 `latest` 为准。插件市场列表里的版本号由站点每晚探测，可能仍显示旧版本，不代表 npm 没有更新。

User-facing milestones only. Install the npm `latest` tag. The plugin market version can lag that tag.

## 0.2.1 — 2026-10-01

- **安全扫描误报收敛**：SSH 私钥输入框占位符不再写死 `.ssh` 示例路径；`git cat-file` 子进程显式 `shell: false`；本机面板回环地址补充说明。
- Harden SSH placeholder / git spawn / local panel bind notes for scanners.

## 0.2.0 — 2026-10-01

- **设计差异分析升为主能力**：与「功能影响分析」并列。以 Figma / 蓝湖设计稿为准，静态对比代码实现（design-only，不依赖 App 运行时渲染）；支持差异清单多选定位、对照图高亮、指定代码文件、关联文件加深、AI 协助分析写回、复制差异 / 提交缺陷 / 导出报告。
- **覆盖栈**：Android（XML / Compose / View）、iOS（Xib / SwiftUI / UIKit）、Flutter、React Native、Harmony ArkUI、Web（HTML / React / Vue / Svelte / Angular）、小程序、uni-app、Taro、.NET MAUI；对比分层 L0 指纹匹配 → L1 属性级 → L2 启发式 → L3 AI 协助。
- **功能影响分析加速**：依赖索引改为路径/符号哈希查找；跳过 `node_modules` / `dist` / `.next` / `Pods` 等；同 commit 进程内缓存。
- **MCP 完整工具面**：与 DSH Host 对齐（影响面 + 手测写回 + 设计差异 / 快照 / 页面匹配）；执行层共用 `@rebornace/dsh-tracescope/agent-api`。
- Design diff is now a first-class pillar alongside impact analysis; MCP parity + indexing speedups included.

## 0.1.13 — 2026-10-01

- **功能影响分析加速**：「生成验证清单」依赖索引由全量扫描改为路径/符号哈希查找；约 2000 源文件时索引构建从十余秒降到约数十毫秒量级。进一步跳过 `node_modules` / `dist` / `.next` / `Pods` 等目录与压缩包文件，并对同一 commit 做进程内索引缓存；本地模式误扫依赖目录时曾会极慢。
- **工程优化**：统一跳过目录常量（设计发现与影响分析共用）；`git cat-file` 流式读缓冲避免反复 `Buffer.concat`；侧栏 `/jobs` 与 MCP 共用 `createHandtestJob`；panel `/api/commits|/api/analyze` 复用 `repo-history`/`runAnalyze`；`discoverAllPages` 短时缓存；MCP 去掉多余的 core 直连依赖。
- **MCP 完整工具面**：`@rebornace/tracescope-mcp` 与 DSH Host 对齐，补齐 `get_diff` / 手测 job 创建与写回 / UI 走查 / 设计快照 / 页面匹配等全部 Agent 能力；执行逻辑抽到 `@rebornace/dsh-tracescope/agent-api`，任意 MCP 客户端可独立走完分析→写回流程。
- **DSH 工具补齐**：新增 `tracescope_list_commits`、`tracescope_create_handtest_job`、`tracescope_start_visual_review`、`tracescope_start_page_rematch`，与 MCP 同名同语义。

## 0.1.12 — 2026-09-30

- **设计差异分析（试验）**：与「功能影响分析」并列的设计稿↔代码差异能力（原「UI 设计对比」等）；差异清单支持多选定位（再点取消）；对照图先出图再后台清理备注层。
- **指定代码文件**：改为弹层选择器——支持按文件名/路径/类型搜索、按目录分组折叠，文件名与路径分行显示，避免长列表挤在卡片里。
- **关联文件**：加深本地路径解析（`@components` / `@views` / `@pages`、同目录裸名、`@import`、PascalCase 标签→`components/`）；Android 界面对比会把引用该 layout 的 Activity/Fragment/Adapter 一并列入关联清单与缓存指纹。
- **差异清单定位**：点击差异后在设计稿对照图上高亮对应区域（高亮层移出缩放容器，避免看不见；兼容 id 格式差异与图标组折叠节点；定位失败时给出提示）。
- **AI 差异高亮**：写回时按设计树补全/纠正 `nodeId`；侧栏再用位置/期望文案/静态差异名回落匹配；静态差异摘要带上真实节点 id，提示词要求禁止臆造 id。
- **UI 走查**：对比板以设计稿 + 差异清单为主，不再展示「代码还原预览」。
- **UI 走查凭证 / 提示词**：Figma Token 与蓝湖 Cookie 分键持久化（切换链接互不覆盖）；AI 协助分析提示词不再嵌入 data URL / base64 设计图（侧栏对照板仍可显示）。
- **蓝湖**：UI 走查缩略图与界面对比「设计稿对照图」均改走服务端带 Cookie 拉取封面为 data URL（避免 CDN 鉴权/浏览器直连失败）；缩略图支持点击查看原图；差异清单支持复制差异、提交缺陷、导出报告；协作平台配置对功能分析与 UI 走查共用。
- **关联文件**：匹配仍选单入口；界面对比与 AI 协助会解析同目录配套、本地 import/include（及 Android layout 依赖闭包），对比板可展开查看；启发式文案对比会合并关联源码；属性级对比会识别自定义组件标签并按名内联；Vue/React/小程序等会合并同名与 import 的样式文件；RN/Flutter/Compose/SwiftUI/UIKit/ArkUI/MAUI/Android View 会加载主题/颜色伴生文件并把 `AppColors.xxx`、`R.color.xxx`、`{StaticResource}` 等改写为可解析色值后再对照；Android XML 会解析 `@color` 别名链、`styles.xml`（含 parent）、`?attr`（含 Material 浅色默认）、`@string`、`<include>` 内联、ConstraintLayout 粗定位（parent / Guideline / Barrier / Chain / Flow、`0dp`、`dimensionRatio`）、`res/color` 与 shape / layer-list / level-list / inset / clip / scale / rotate / transition / animation-list / ripple（跳过 mask） / vector tint / adaptive-icon drawable，以及 ImageView `tint`/`scaleType`、Material CardView `cardBackgroundColor`/`cardCornerRadius`/`contentPadding`、`tools:listitem` 列表项预览展开，并按 `uiMode`（`page.hints` / `TRACESCOPE_ANDROID_UI_MODE`）优先日间或 `values-night`；iOS Xib/Storyboard 会解析内嵌 `namedColor`、常见 `systemColor`、Dynamic Type 文本样式字号与邻近 `.xcassets` colorset；SwiftUI 会映射 TextStyle 字号/字重（含 `.weight`）、`foregroundStyle` / 系统色、`EdgeInsets` / `safeAreaPadding` / `safeAreaInset`；Web / 小程序会内联 `var(--token)`、解析 `hsl()` / 现代 `rgb()` / `oklch()` / `color-mix()` / `light-dark()` / `aspect-ratio` / `object-fit` / `object-position` / `background-size`/`background-position` / `gap` + `align-items`/`place-items`/`justify-content`（flex 粗排） / `clamp|min|max()` / `rpx|upx` / `cqw|cqh` 长度，并按 `color-scheme` / `@media (prefers-color-scheme)` / `@container`（默认 360×640）选择分支，合并邻近全局主题；Flutter/Compose 会解析 `ColorScheme` / `ThemeData` / `TextTheme` / `Typography` / `MaterialTheme.shapes` / `BorderRadius.circular|all|only` / `PaddingValues` / `EdgeInsets.fromLTRB|fromSTEB|only` / WindowInsets padding（statusBars / navigationBars / systemBars / ime / displayCutout） / `fillMaxWidth|Height|Size` / Column|Row Arrangement；SwiftUI VStack|HStack spacing；Flutter Column|Row + SizedBox；RN flexDirection/gap；ArkUI 会解析 `fp()` / `FontSize.*` / `$r('app|sys.float.*')` 字号 token；MAUI 会读取 VisualState `Normal` Setter 色与字号；RN 会改写 `theme.colors.*` / `useTheme().colors.*` / `StyleSheet.hairlineWidth`。
- **设计稿 UI 走查（design-only）**：以 Figma / 蓝湖设计稿为准做静态对比，不再依赖 native 运行时渲染。
  - 页面发现覆盖 Android XML / Compose / View、iOS Xib / SwiftUI / UIKit、Flutter、React Native、Harmony ArkUI、Web（HTML/React/Vue/Svelte/Angular）、小程序（WXML/AXML/TTML/Swan）、uni-app、Taro、.NET MAUI XAML
  - 对比分层：L0 指纹匹配 → L1 属性级静态树 → L2 启发式文案/控件规模 → L3「AI 协助分析」（按适配器生成源码阅读清单，非 XML 不再误走 Android 依赖闭包）
  - 匹配近并列时优先专用栈（uni-app / Taro / 小程序 等），避免被通用 web-vue / web-react 抢走
  - L1 加深：Android `adaptive-icon`、Material CardView、`tools:listitem`/`tools:itemCount`、静态文字度量（字形类 advance + letterSpacing/字重 + 拉丁词边界换行，与 layout engine 共用）、动态列表占位文案可按设计稿静态填入；`elevation`/`cardElevation`、`android:rotation`/`scaleX|Y`/`translationZ`/`textAllCaps`/`clipChildren`/`clipToOutline`/`maxLines`/`ellipsize`、`layout_constraintDimensionRatio`→aspectRatio、`android:minWidth|minHeight|maxWidth|maxHeight`；Compose/SwiftUI/Flutter/RN 轴布局与列表粗展开 + shadow；Figma `DROP_SHADOW`/`INNER_SHADOW` 多阴影叠层全参数→`shadows`/`shadow`/`insetShadow`、`blendMode`、`LAYER_BLUR`/`BACKGROUND_BLUR`→blur、`individualStrokeWeights`→分边描边、`fills[]` 多填充叠层、`strokeAlign`、`rotation`/`scaleX|Y`/`skewX`（含 `relativeTransform`）、`textDecoration`/`textCase`、`clipsContent`→overflow、`isMask`/`maskType`→clipPath、`textTruncation`/`maxLines`、`minWidth|maxWidth|minHeight|maxHeight`、文本固有宽 `textAdvanceWidth`、多行块高 `textBlockHeight`、Auto Layout `flexDirection`/`alignItems`/`justifyContent`/`gap`（`itemSpacing`）、`fontStyle`/`textAlignVertical`、描边样式 `borderStyle`（`strokeDashes`）、段间距 `paragraphSpacing`、尺寸模式 `sizingHorizontal|Vertical`（FIXED/HUG/FILL）、背景模糊 `backdropBlur`（与 layer `blur` 分离）、`position`、`rowGap`/`columnGap`、换行 `flexWrap`（`layoutWrap`）、自身对齐 `alignSelf`（`layoutAlign`）、弹性 `flexGrow`/`flexShrink`（`layoutGrow`/`weight`/`Expanded`）、变换原点 `transformOrigin`、可见性 `visibility`/`display`、空白 `whiteSpace`（`textAutoResize`）、多行对齐 `alignContent`（`counterAxisAlignContent`）、`order`、网格轨道 `gridTemplate`、虚线间隔 `strokeDashArray`、线帽 `strokeCap`、线连接 `strokeJoin`、断词 `wordBreak`、词间距 `wordSpacing`、首行缩进 `textIndent`（`paragraphIndent`）、3D `perspective`/`rotateX|Y`、`textShadow`、书写 `direction`/`writingMode`、滤镜指纹 `filter`、轮廓 `outline`、clip-path polygon 点位指纹；蓝湖多阴影叠层 + blend + fills/rotation/scale/skew/zIndex/描边对齐/文字装饰/overflow/mask/aspectRatio/截断/min-max/textAdvanceWidth；CSS 多 `box-shadow` 叠层、`mix-blend-mode`、`%` 宽高（相对 360×640）、`filter|backdrop-filter: blur`、`transform: translate|rotate|scale|skew`、`rotate`/`scale`、`z-index`、`clip-path`、`aspect-ratio`、`box-sizing`→strokeAlign、多层 `background`→fills、`text-decoration`/`text-transform`/`overflow`/`text-overflow`/`line-clamp`、`inset`/`left+right`/`top+bottom`、`min|max-width|height`；Compose `widthIn`/`heightIn`/`sizeIn`、SwiftUI `.frame(minWidth:…)`、Flutter `BoxConstraints`、RN `minWidth`/`maxWidth`、ArkUI `constraintSize`、CSS `flex-direction`/`align-items`/`justify-content`/`font-style`、Android `LinearLayout` orientation/gravity/`textStyle=italic`/`match_parent|wrap_content`→sizing、shape `dashWidth`；CSS `border-style`/`width:auto|100%`；Compose `fillMax*`/`dashPathEffect`、SwiftUI `maxWidth:.infinity`/`StrokeStyle(dash:)`、RN `borderStyle`、CSS `backdrop-filter`/`position`/`gap` 双轴、Flutter `BackdropFilter`/`Positioned`、SwiftUI Material≈backdropBlur、RN `position`/`rowGap`、CSS `flex-wrap`/`align-self`/`flex-grow|shrink`/`flex`、Compose `weight`/`FlowRow`/`align`、Flutter `Expanded`/`Flexible`/`Wrap`/`Align`、SwiftUI `layoutPriority`、RN `flexWrap`/`alignSelf`/`flexGrow`/`flexShrink`、Android `layout_weight`/`flexWrap`/`layout_gravity`、CSS `transform-origin`/`visibility`/`display`/`white-space`、Compose `.hidden`/`softWrap`、Flutter `Visibility`/`softWrap`、SwiftUI `.hidden`、RN `transformOrigin`/`visibility`/`whiteSpace`、Android `visibility`/`transformPivot*`/`singleLine`、CSS `align-content`/`order`/`grid-template*`、Flutter `Wrap.runAlignment`、RN `alignContent`/`order`、Android Flexbox `alignContent`/`layout_order`、CSS `stroke-dasharray`/`stroke-linecap`/`stroke-linejoin`、Compose/Flutter/SwiftUI/RN dash+cap+join、Android shape `dashWidth`/`dashGap`/`strokeLineCap|Join`、CSS `word-break`/`overflow-wrap`/`word-spacing`/`text-indent`、Compose/Flutter/SwiftUI/RN wordSpacing+textIndent、Android `breakStrategy`、CSS `perspective`/`rotateX|Y`/`text-shadow`/`direction`/`writing-mode`/`filter`非blur/`outline*`、polygon 坐标指纹、RN 同步解析；Compose/SwiftUI/Flutter/RN/ArkUI 解析 rotate/scale/zIndex/underline/clip/clipPath/aspectRatio/maxLines；对比引擎补齐 imageFit/imagePosition/textAlign/textDecoration/textTransform/overflow/clipPath/aspectRatio/maxLines/textOverflow/cornerRadii/gradient/elevation/shadow/insetShadow/shadows/fills/rotation/scaleX|Y/skewX|Y/zIndex/strokeAlign/innerShadow/blur/blendMode/分边描边/minWidth|maxWidth|minHeight|maxHeight/textAdvanceWidth/textBlockHeight/flexDirection/alignItems/justifyContent/fontStyle/textAlignVertical/borderStyle/paragraphSpacing/sizingHorizontal|Vertical/backdropBlur/position/rowGap|columnGap/flexWrap/alignSelf/flexGrow|flexShrink/transformOrigin/visibility/display/whiteSpace/alignContent/order/gridTemplate/strokeDashArray/strokeCap/strokeJoin/wordBreak/wordSpacing/textIndent/perspective/rotateX|Y/textShadow/direction/writingMode/filter/outline；缺坐标时按文档序或轴布局粗排；字间距/行高平台默认软审、色值×节点 opacity；CSS 无单位 `line-height`×字号、`letter-spacing` em×字号；Android `letterSpacing` em×textSize、`android:alpha`；Compose/SwiftUI/Flutter/RN/ArkUI 解析 letterSpacing/lineHeight/opacity/blur/offset 与阴影全参数（含 `Color.copy(alpha)` / `withOpacity`）；蓝湖 fill.opacity 写入色值 alpha
  - Design-only UI review across mobile/web/miniprogram stacks; L0–L3 compare; Figma + Lanhu sources; specialized adapters win near-ties.

## 0.1.11 — 2026-09-21

- **语言支持扩展（静态反向依赖波及）**：
  - 移动端：Kotlin（`.kt/.kts`）、Java（`.java`，与 Kotlin 互调）、Swift（`.swift`，与 ObjC 互调）、Objective-C（`.m/.mm/.h`）、Dart/Flutter（`.dart`，`package:` / 相对 import / `part`）
  - Web：TypeScript/JavaScript（`.ts/.tsx/.mts/.cts/.js/.jsx/.mjs/.cjs`，`import`/`require`/动态 `import()`、`@/` 别名）、Vue（`.vue` SFC，`<script>` + `<template>` 组件标签）、CSS/SCSS/Sass/Less（`@import/@use/@forward`、`url()`、class/id 反查）、HTML（`<link>`/`<script>`）
  - 其他语言仍正常输出**直接变更**清单（不限语言），但没有反向依赖波及链路。
- Static ripple extended to Java/Swift/Dart, TS/JS/Vue/CSS/HTML.

## 0.1.10 — 2026-09-21

- **同步后默认**：自动落到「最新」分支；待测 = 最新提交，稳定 = 倒数第二次提交。分支列表仍用「稳定 / 待测」分开选。
- 默认选中后，当前分支上的「稳定」「待测」都会显示勾选（不再只勾待测）。
- 分支列表按最新活动排序，并标出「最新」分支（对齐云效 Codeup）。
- After sync: newest branch + 待测=latest / 稳定=second-latest; both buttons check.

## 0.1.9 — 2026-09-21

- **分支切换**：可按名称筛选，点「稳定 / 待测」后列表自动收起；选中分支后「近期提交」按该分支重新加载（不再只显示默认主分支）。
- **个人访问令牌**与 **HTTPS 用户名 + 密码/Token** 分开：令牌模式适用于云效 / GitHub / GitLab 等；HTTPS 保持双字段。令牌会记在本机，重启不用重填。
- 「缺陷平台」改名为 **协作平台**（关联工作项 + 失败反馈）。
- Branch picker collapses after choose; recent commits follow the selected branch. PAT auth is separate from HTTPS username+password and persists across restarts. Tracker section renamed to collaboration platform.

## 0.1.8 — 2026-09-21

- **读取方式**可在「仓库配置」里选：
  - **本地 Git**：清单和模型分析改为按提交读取 git 对象，不再依赖工作区里的源码文件是否能打开。新的远端同步使用 `git clone --bare`（只留对象库）。已经检出在 `~/.tracescope/repos` 里的缓存继续可用。
  - **云效代码接口**：没有 git 或本地环境不可用时的兜底。用 Codeup 地址和有代码读权限的个人访问令牌拉取提交与 diff，生成**直接变更**清单；模型对话也能看 diff。这一档**没有**本地静态波及。
- Read mode: local git objects (new remotes clone bare; existing checkouts still work), or a Codeup API fallback that produces a direct-change checklist and diffs for the model, without static ripple.

## 0.1.7 — 2026-09-21

- 克隆或 fetch 之后，用更长的指数退避等待 git 工作区就绪（克隆后约 55 秒，fetch 后约 45 秒），避免杀毒软件扫盘期间被立刻判失败并删掉重克隆。
- Longer exponential settle wait after clone/fetch before treating the cache as broken.

## 0.1.6 — 2026-09-21

- 克隆结束后增加短重试，降低刷盘瞬间 `rev-parse` 失败造成的误判。
- Short retries immediately after clone.

## 0.1.5 — 2026-09-21

- 缓存不完整时先说明缺什么（没有 `.git`、git 报错、目录里有什么），再决定是否清掉重装。小仓库文件少不再被当成「克隆未完成」。
- Clearer incomplete-cache diagnostics. A small file count is not treated as a failed clone.

## 0.1.4 — 2026-09-20

- 为插件管理的缓存目录自动设置 `safe.directory=*`，减少 Windows 上 “dubious ownership” 把正常仓库判失败。
- 失败信息带上可核对的 git / 目录细节。
- Automatic `safe.directory=*` for managed caches, plus richer failure detail.

## 0.1.3 — 2026-09-20

- 面板在同步、生成清单、拉取云效目录等操作期间加加载锁，完成前不能重复点其它按钮。
- 远端缓存确认损坏后会清掉并重新克隆。
- Busy lock while network work is in progress. Broken remote caches are wiped and recloned.

## 0.1.2 — 2026-09-20

- 加固云效企业下的项目列表解析（嵌套返回、精简请求体），避免组织能打开但项目下拉是空的。
- 面板可查看云效请求日志（不含 token），便于区分「接口没数据」和「界面没刷出来」。
- Hardened Yunxiao project-list parsing, plus an in-panel request log that never includes the token.

## 0.1.1 — 2026-09-18

- 去掉运行时动态拼代码，以便通过 DSH 的 `dsh.so` 扫描，插件可以安装。
- Removed a dynamic code constructor so the package passes the DSH `dsh.so` scan.

## 0.1.0 — 2026-09-18

首发。DSH Web / Desktop 右侧栏手测范围插件。

- 两个提交之间的影响面：直接变更 + 反向依赖波及（默认深度 2）
- 功能名：`tracescope.modules.yml` → 静态标题 → 路径启发式
- 多仓库、HTTPS / SSH 认证；默认同步待测 = 最新提交、稳定 = 次新提交
- 确定性清单落盘；同一对版本只保留最新一条历史
- 模型对话分析：任务草稿 + `tracescope_publish_handtest` 回写
- 勾选通过 / 失败 / 跳过；失败备注，每条最多 3 张截图
- 任务级附件（最多 8 个）
- 关联云效敏捷工作项（类型、任务均可多选）
- 缺陷提交：云效 / GitHub / GitLab / Webhook；可改标题。云效上传任务附件，并把截图嵌进缺陷详情
- 导出 Markdown / CSV
- 本机数据在 `~/.tracescope/`
- npm：`@rebornace/tracescope-core`、`@rebornace/dsh-tracescope`、`@rebornace/tracescope-mcp`

Initial release: DSH sidebar checklist from a stable → under-test commit pair, with notes, screenshots, task attachments, and defect submit.
