# 更新日志 / Changelog

只记对使用者有影响的功能节点，不记文档编码、关键词之类的内部提交。  
安装请以 npm 上的 `latest` 为准。插件市场列表里的版本号由站点每晚探测，可能仍显示旧版本，不代表 npm 没有更新。

User-facing milestones only. Install the npm `latest` tag. The plugin market version can lag that tag.

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
