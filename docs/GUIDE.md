# TraceScope 功能说明

本文档说明插件的实际能力、侧栏用法、对比分层、适配器深度增强与已知限制。  
安装与一句话能力概览见仓库根目录 [README.md](../README.md)；工程结构见 [ARCHITECTURE.md](../ARCHITECTURE.md)。

**当前版本：`0.3.5`**（以 [npm `latest`](https://www.npmjs.com/package/@rebornace/dsh-tracescope) 与侧栏显示为准）

---

## 目录

1. [三条主能力](#1-三条主能力)
2. [功能影响分析](#2-功能影响分析)
3. [设计差异分析](#3-设计差异分析)
4. [崩溃分析](#4-崩溃分析)
5. [适配器深度增强](#5-适配器深度增强)
6. [设计稿凭证与仓库切换](#6-设计稿凭证与仓库切换)
7. [协作平台与本机数据](#7-协作平台与本机数据)
8. [更新本插件](#8-更新本插件)
9. [MCP 工具一览](#9-mcp-工具一览)
10. [已知限制](#10-已知限制)
11. [路线图与扩展计划](#11-路线图与扩展计划)

---

## 1. 三条主能力

| 能力 | 输入 | 输出 |
|------|------|------|
| **功能影响分析** | 稳定版 ↔ 待测版（本地 Git 或云效代码接口） | 直接变更 + 静态波及清单；可标注、截图、导出、提单 |
| **设计差异分析** | Figma / 蓝湖设计稿 + 代码仓页面 | 静态差异清单 + 设计对照图高亮；可 AI 协助写回、导出、提单 |
| **崩溃分析** | 友盟 U-APM（Cookie）/ Firebase Crashlytics（Token）或粘贴堆栈 + 代码目录 | 堆栈解析、仓库文件命中、双语报告；AI 工具写回结论；开发写会话、测试提交缺陷 |

三条能力共用侧栏里的协作平台配置（云效 / GitHub / GitLab / Webhook）。「设计差异分析」与「崩溃分析」的「提交缺陷」各自使用专用正文模板（不再套用功能影响的「验证失败」模板）。

推荐使用路径：

1. **DeepSeek Harness 桌面端**右侧栏 TraceScope 插件（内嵌工作台 + 可灌当前会话 AI 提示词）  
2. **任意 MCP 客户端**（Cursor / Claude Desktop 等）：配置 `@rebornace/tracescope-mcp` 后调用 `tracescope_open_panel`，打开与侧栏**同款三模式工作台**（`127.0.0.1:3927`，API 同为 `/tracescope/v1/*`）；AI 提示词会复制到剪贴板，粘贴回 Agent，再用 `publish_*` 写回面板  

执行层与崩溃工具在 MCP 与 Host 共用 `agent-api`（见 [§9 MCP 工具一览](#9-mcp-工具一览)）。

### 界面语言

侧栏、插件详情 / 更新、AI 提示词与 Host API 错误支持**中文 / English**。语言跟随桌面端（Host）界面语言，与设置中的语言偏好一致；**插件内不提供独立中英切换**。未知语言时回退中文。

---

## 2. 功能影响分析

### 2.1 做什么

给定两个版本，回答「改了什么、可能波及什么」，并落到可勾选的验证清单。

### 2.2 分析规则（摘要）

- **直接变更 + 反向依赖波及**（默认深度 2）
- 本地 Git 按**提交对象**建索引，不要求工作区文件此刻可读
- **可推导静态波及的语言**：Kotlin / Java、Swift / Objective-C、Dart/Flutter、TypeScript / JavaScript、Vue、CSS 系、HTML  
  其他语言仍进直接变更清单，但不推导静态波及
- **读取方式**：本地 Git（完整能力）；**云效代码接口**兜底（无静态波及，对话仍可读 diff）
- **人话功能名**：`tracescope.modules.yml` → 静态标题 → 启发式命名（示例见 [`examples/tracescope.modules.yml`](../examples/tracescope.modules.yml)）

### 2.3 侧栏工作流

1. 选仓库与读取方式，同步稳定 / 待测版本  
2. （可选）配置协作平台、关联云效敏捷任务  
3. **生成清单**或走模型对话分析  
4. 逐项通过 · 失败 · 跳过；备注与截图（每条最多 3 张）；任务级附件  
5. 导出 Markdown / CSV，或复制问题反馈 / 提交缺陷  

---

## 3. 设计差异分析

### 3.1 做什么

以 **Figma / 蓝湖** 为真源，对代码做**静态**对比（不依赖 App / 浏览器运行时截图）。用于走查、还原度核对、差异定位与缺陷回传。

### 3.2 页面发现覆盖

| 平台 | 适配器（摘要） |
|------|----------------|
| Android | XML / Compose / View |
| iOS | Xib / SwiftUI / UIKit |
| 跨端 | Flutter、React Native、Harmony ArkUI、uni-app、Taro |
| Web | HTML / React / Vue / Svelte / Angular |
| 小程序 | WXML / AXML / TTML / Swan 等 |
| 其他 | .NET MAUI XAML |

具体匹配与属性抽取由 `packages/core` 中各 `PlatformAdapter` 实现；能力深度因栈而异（见下文「深度增强」与限制）。

### 3.3 对比分层

| 层级 | 含义 |
|------|------|
| **L0** | 设计指纹 ↔ 代码页匹配（可接受推荐，也可指定文件 / AI 重新推荐） |
| **L1** | 属性级静态树对比（`DesignDoc` ↔ `DesignDoc`） |
| **L2** | 启发式：文案 / 控件规模等（无精确几何树时） |
| **L3** | AI 协助分析：生成阅读清单与提示词，结论可写回侧栏 |

主路径 API：`POST /tracescope/v1/design-compare`（兼容别名 `/hifi-compare`）。

### 3.4 侧栏能力

- 粘贴设计稿链接 + 凭证后扫描；常用链接可保存 / 点选 / 删除  
- 卡片：**界面对比**、**指定代码文件**、**AI 协助分析**、重新推荐文件  
- 结果板：设计对照图、差异清单多选定位高亮、关联文件列表  
- 复制差异 / 提交缺陷 / 导出报告（协作配置与影响分析共用）  
- **适配器深度增强**开关（见下一节）

### 3.5 设计稿来源

| 来源 | 凭证 | 说明 |
|------|------|------|
| Figma | Personal Access Token（`figd_…`） | 链接带 `node-id` 时优先该页 |
| 蓝湖 | 浏览器 Cookie | 有 `image_id` 扫单稿，否则扫项目；协议参考了社区实现，本仓库适配器为自研 |

蓝湖若自动匹配为空，需在卡片上「指定代码文件」后再对比。

设计稿来源同样按**横向扩展**接入（拉取后归一到统一 `DesignDoc`，主对比路径不绑死 Figma / 蓝湖）。若你需要 MasterGo、即时设计等其它设计平台，欢迎 [提 Issue](https://github.com/rebornace/dsh-tracescope/issues)（见 [§11](#11-路线图与扩展计划)）。

---

## 4. 崩溃分析

侧栏顶部分档：**功能影响分析** / **设计差异分析** / **崩溃分析**。崩溃模式仍使用上方的**代码目录**（本地文件夹即可，用于按堆栈帧文件名匹配源码；不必是 Git 仓库）与**协作平台**配置。

### 4.1 做什么

从**友盟 U-APM**（国内）或 **Firebase Crashlytics**（海外）拉取崩溃 / ANR 列表与详情，或在凭证不可用时**粘贴堆栈**降级；对照当前代码目录生成摘要、命中文件与修复提示；支持本地分析、将提示词写入会话并由 Agent **工具写回** AI 结论，以及向协作平台提交专用缺陷正文。侧栏「数据源」可切换。

数据源按 **`CrashProvider` 插件化横向扩展**（见 [§11 路线图与扩展计划](#11-路线图与扩展计划)）：后续会逐步增加更多崩溃 / APM 平台；若你急需某一平台，欢迎 [提 Issue 反馈](https://github.com/rebornace/dsh-tracescope/issues)，可优先适配。

### 4.2 友盟凭证（Console Cookie）

1. 浏览器登录 [友盟 U-APM 控制台](https://apm.umeng.com/)，打开目标应用的**崩溃列表**页（路径含 `error_analysis/crash`）。  
2. 开发者工具 → **Network** → 任选发往 `apm.umeng.com` 的 XHR（如 `/hsf/analysis/errorList`）→ 复制请求头 **Cookie** 整段（须能打开该 App 崩溃列表；至少含 `EGG_SESS` / `umplus_uc_token`，`ctoken` 可选）。  
3. 侧栏「友盟配置」填写 **AppKey** 与 **Cookie**，勾选「记住凭证」后点 **保存** 或 **自检**（`crash-probe`；自检成功也会按勾选写入本机）。  
4. **清除 Cookie** 只删本机保存的 Cookie，不影响友盟账号。  

合规说明（侧栏 `crash.cookieHint`）：仅读取您已在控制台登录后可查看的数据；Cookie 仅存本机且请求仅发往友盟域名。请遵守友盟服务条款，勿分享 Cookie。

凭证与 AppKey 会同时写入**全局**与当前仓库键（远程 Git URL 用规范化 URL）；切换代码目录时仍会带出已保存的 AppKey / Cookie。友盟配置区可折叠；点开某条崩溃详情时会自动收起，以便下方分析区露出来。

### 4.2b Crashlytics 凭证（Access Token / 服务账号）

面向海外 Firebase 项目；国内环境需能访问 Google API（见下方代理）。

#### 准备项目与权限

1. 在 [Firebase Console](https://console.firebase.google.com/) → 项目设置，复制 **项目 ID**（可填项目编号）与目标应用 **App ID**（形如 `1:1234567890:ios:abcdef`）。  
   - 请求路径会**优先使用 App ID 中的项目编号**（第二段数字），避免只填项目 ID 字符串时出现 `NOT_FOUND`。  
2. 在 [Google Cloud](https://console.cloud.google.com/apis/library/firebasecrashlytics.googleapis.com) **启用 Firebase Crashlytics API**（未启用会报 API disabled / 403）。  
3. 若用服务账号：在 [IAM](https://console.cloud.google.com/iam-admin/iam) 为 JSON 里的 `client_email` 授予 **Firebase Crashlytics Viewer**（`roles/firebasecrashlytics.viewer`）或 **Firebase Viewer**；仅有 Admin SDK 默认角色常不够（`PERMISSION_DENIED`）。

#### 鉴权（推荐 Access Token）

| 方式 | 说明 |
|------|------|
| **Access Token（推荐）** | `gcloud auth login` 后执行 `gcloud auth print-access-token`，粘贴到侧栏。`ya29.` Token 约 **1 小时**过期。 |
| **本机 gcloud 自动刷新** | 若 PATH 上已有 `gcloud` 且已登录，插件会**优先**调用 `gcloud auth print-access-token` 取新 Token（约缓存 50 分钟），不必每小时重贴。 |
| **服务账号 JSON** | 粘贴具备 Crashlytics Viewer 的密钥 JSON（可长期存本机）。可做连通校验，但对 `topIssues` **完整报告**支持不完整（常 404）；控制台有崩溃数据时请改用 Access Token。 |

用户 Token 请求会自动带 `x-goog-user-project`（侧栏项目 ID）以满足 Google **配额项目**要求；缺少时会出现 “requires a quota project”。

#### 安装 gcloud（国内）

官方小安装器常因直连 Google 失败（`Download failed: SendRequest Error`）。请开代理后下载**完整 zip**：

```powershell
$env:HTTPS_PROXY = 'http://127.0.0.1:7890'   # Clash 等
$zip = "$env:USERPROFILE\Downloads\google-cloud-cli-windows-x86_64.zip"
Invoke-WebRequest -Uri 'https://dl.google.com/dl/cloudsdk/channels/rapid/downloads/google-cloud-cli-windows-x86_64.zip' -OutFile $zip -Proxy $env:HTTPS_PROXY
Expand-Archive $zip -DestinationPath "$env:LOCALAPPDATA" -Force
& "$env:LOCALAPPDATA\google-cloud-sdk\install.bat"
# 将 %LOCALAPPDATA%\google-cloud-sdk\bin 加入用户 PATH 后新开终端
gcloud auth login
gcloud auth print-access-token
```

#### 侧栏操作与代理

1. 数据源选 **Firebase Crashlytics**，填项目 ID / App ID 与凭证，勾选 **记住凭证** → **保存凭证**。  
2. 点配置区外始终可见的 **拉取列表**（不埋在筛选折叠里）。  
3. 国内访问 Google：自动使用 **系统代理** 或环境变量 `HTTPS_PROXY` / `HTTP_PROXY`（如 Clash `http://127.0.0.1:7890`）。OAuth / Crashlytics 请求与 `gcloud` 刷新均走同一套代理探测。

#### 常见报错

| 现象 | 处理 |
|------|------|
| API 未启用 / Enable it by visiting… | 打开报错中的链接或 API Library，启用 Firebase Crashlytics API |
| `PERMISSION_DENIED` | IAM 授予 Crashlytics Viewer；确认 gcloud 登录账号能打开该 Firebase 项目 |
| 缺少配额项目 / quota project | 侧栏填好项目 ID；或 `gcloud auth application-default set-quota-project <项目ID>` |
| Access Token 已失效 | `gcloud auth print-access-token` 重贴，或依赖本机 gcloud 自动刷新 |
| `topIssues` 404 但 App 存在 | 多为该 App **尚无崩溃事件**，或服务账号读不到完整报告 → 查控制台 / 改用用户 Token |
| 安装 gcloud Download failed | 走上方 zip + 代理，勿用无代理的官方 exe 安装器 |

### 4.3 列表与筛选（默认可折叠）

凭证就绪后可拉列表。侧栏**过滤**区默认折叠（一行摘要当前条件），需要时再展开；修改后须点 **应用筛选并查询** 才会请求（避免误触频繁打接口）。应用成功后过滤区会再次收起。

**友盟**：筛选项与 U-APM Console 同源：版本 / 系统 / 机型来自元数据接口（`getVersionsList` / `getMetaosList` / `getDevices`），**仅可勾选**，勿手输；请求体字段为 `version` / `os` / `device` 数组。

**Crashlytics**：列表走官方 REST `reports/topIssues`；筛选映射为报告 `filter.*`（时间窗、版本、错误类型、状态、关键字等）。iOS 机型维度使用 `topAppleDevices`（不是 Android 的 `topDevices`）。无崩溃数据时列表为空（属预期）。

| 过滤 | 说明 |
|------|------|
| **timeRange** | 近 24h / 7d / 30d / 90d，或自定义起止日期（对应友盟 `dateType` + `startDay` / `endDay`；预设勿与 `custom` 混用） |
| **appVersion** | 从友盟版本列表多选；同维度内为「或者」 |
| **errorKind** | crash / ANR / error / other（单选时映射为友盟 `errorType`） |
| **osVersions / deviceModels** | 从友盟系统 / 设备列表勾选；**跨维度为并且**（版本 ∩ 系统 ∩ 机型），同维度内多选为或者；每维最多 **10** 项（与控制台一致） |
| **device 取值** | 使用硬件标识（如 `iPhone17,4`），不是展示名；标识中的逗号会原样保留，不会被拆开 |
| **sort** | 次数 / 最近发生 / 标题，升序或降序 |
| **status** | open / closed / other（本地软过滤；列表行可能缺状态字段） |
| **keyword** | 作为友盟 `errorAbstract` 下发 |

点击列表行加载详情堆栈（`crash-detail`）。Cookie 失效（如 `UMENG_AUTH`）时会提示并展开**粘贴堆栈**区，仍可分析与提交。

### 4.4 分析、写会话、AI 回写与提交

详情或粘贴区下方主按钮：

| 侧栏按钮 | 典型角色 | 行为 |
|----------|----------|------|
| **分析**（本地分析） | 开发 / 测试共用 | `POST /tracescope/v1/crash-analyze`：解析堆栈、在代码目录内按文件名匹配源码，展示摘要与命中文件。**不调模型**。提交缺陷前须先有报告。 |
| **分析并写入会话** | **开发** | 若尚无报告则先本地分析；再创建崩溃 AI 任务（`crash-ai-job`），把带 **任务 ID** 的提示词填入当前会话输入框（**不自动发送**）。发送后 Agent 应调用 `tracescope_publish_crash_analysis`；侧栏轮询任务并**自动回写**绿色「AI 分析结论」。若未自动回写，可点「回写 AI 结论」拉取，或粘贴回复后再回写。 |
| **复制 / 导出 / 提交缺陷** | 测试等 | 复制报告、导出 Markdown，或提交到协作平台（`feedbackKind: 'crash'` + 预构建 `defectBody`，可含 AI 结论）。云效 / GitHub 附件规则与另两条主能力相同；GitLab / Webhook 仍不上传二进制。 |

Host 路由：`crash-config`、`crash-config-save`、`crash-cookie-clear`、`crash-probe`、`crash-filter-options`、`crash-list`、`crash-detail`、`crash-analyze`、`crash-ai-job`、`crash-job`。

桌面端内置 skill：`tracescope-crash-analysis`（引导 Agent 用写回工具）。

### 4.5 本节已知限制（摘要）

- **Console 依赖**：取数走友盟 Web Console 协议，非官方 OpenAPI；`transport: openapi` 尚未实现。Console 变更可能导致列表 / 详情失败，可改用粘贴堆栈。  
- **Cookie 生命周期**：会话过期需重新复制 Cookie；自检失败时请更新 Cookie 或粘贴降级。  
- **筛选交集**：多维度同时勾选时很容易得到 0 条（并且关系）；请先少选维度，或清空系统 / 机型只留版本试查。  
- **无符号化**：不做 dSYM / mapping 还原；仓库命中按堆栈**文件名**搜索，可能误匹配或漏匹配。  
- **协作附件**：GitLab / Webhook 不上传二进制（与 §10 一致）。  
- **AI 结论缓存**：写回后按仓库 + 崩溃 id 存本机；再次本地分析会自动带出（不调模型）。侧栏可清除缓存后重新「分析并写入会话」。  
- **MCP**：崩溃工具已进 `@rebornace/tracescope-mcp`（与侧栏共用 agent-api）；无侧栏时也可在任意 MCP 客户端完成列表 → 分析 → 写回。  

更完整限制见 [§10 已知限制](#10-已知限制)。

---

## 5. 适配器深度增强

### 5.1 概念

设计对比的**主路径对所有适配器一视同仁**：有 `toDesignDoc` 则走 L1，否则走 L2 启发式。

个别栈若需要「超出通用属性解析」的能力（布局引擎、动态列表还原等），以 **enrichment 插件**形式挂载，而不是在主路径里写死分叉。实现目录：

`packages/dsh-tracescope/src/design-enrichment/`

侧栏勾选 **「适配器深度增强」**（默认开启，全局记住）：

- **开**：若当前页的适配器已注册 enrichment，则使用增强结果  
- **关**：全栈统一走属性级 / 启发式，更快、粒度更一致  

对比结果标题可能显示为 `属性级 · 深度增强（adapterId）`。开关变化会写入不同缓存键，避免串结果。

### 5.2 当前已注册的增强

| 适配器 | 增强内容 | 未开启 / 无增强时 |
|--------|----------|-------------------|
| **android-xml** | 静态布局引擎（按设计稿视口量测）、依赖闭包指纹、Adapter 绑定还原列表 item、动态区域文案投影 | 与其它栈相同：`toDesignDoc` 属性级对比 |

### 5.3 尚未提供 enrichment 的栈

Compose、iOS、Flutter、RN、Web、小程序等：**不因开关而走安卓逻辑**；开关关闭时也不会降低它们已有的 L1 能力。  
后续若某栈补齐布局引擎 / 列表还原等，会作为新的 enrichment 文件注册，主路径无需再分叉。

### 5.4 与「高保真 / 代码还原预览」的关系

当前产品定位是 **设计稿静态差异分析**，不是真机渲染或代码 UI 实时预览。历史命名 `hifi-*` 已收敛为 `design-compare` / `designTree` 等；兼容别名仍保留。

---

## 6. 设计稿凭证与仓库切换

- **设计稿链接**：可按代码仓库记忆；无仓库记录时回退到全局  
- **Figma Token / 蓝湖 Cookie**：按字段「仓库覆盖 → 全局」解析；**同一设计平台登录不会因切换代码仓被空值覆盖清空**  
- Figma 与蓝湖凭证分键保存，互不覆盖  

---

## 7. 协作平台与本机数据

### 7.1 协作

- 云效 / GitHub Issues / GitLab Issues / 通用 Webhook  
- 可改默认缺陷标题；云效支持附件上传与详情内嵌图  
- 功能影响、设计差异、**崩溃分析**共用同一套平台配置；崩溃提单使用专用 crash 正文  
- 可选关联云效敏捷任务（多选类型与任务），辅助清单种子 / 提示词  
- 协作平台按 **`TrackerAdapter` 注册表**横向扩展（与崩溃 `CrashProvider`、设计稿来源同一思路）；需要 Jira / 飞书等可 [提 Issue](https://github.com/rebornace/dsh-tracescope/issues)（见 [§11](#11-路线图与扩展计划)）  

### 7.2 本机目录 `~/.tracescope/`

认证、协作配置、报告、附件、远端仓库缓存、设计对比磁盘缓存等。

---

## 8. 更新本插件

自更新**不绑定** dshmarket：官方桌面端即使未安装插件市场，也可检查与安装新版本。

### 8.1 检查从哪里来

Host 同域接口 `GET /tracescope/v1/self-update/check`：读取本包当前版本，向 **npmmirror → npmjs** 查询 `latest`，并返回是否可升级、建议安装的 spec，以及 CLI / 桌面端提示文案。

### 8.2 安装怎么走（优先级）

1. **官方插件管理器** `pluginManager.installBundle`（按检查结果装到 npm 最新版；桌面端 / Web 插件页自带）  
2. **可选**：若本机已装 dshmarket，才尝试其公开 Update API（不是前置条件）  
3. **兜底提示**：扩展坞（Extension Dock）或命令行，例如：

```bash
dsh plugin --profile desktop add @rebornace/dsh-tracescope
```

安装成功后请在**桌面端重启** Harness 使新版本生效。

### 8.3 界面入口

| 入口 | 行为 |
|------|------|
| 插件 → TraceScope 详情 → **卸载旁「更新」** | 进页自动检查；有新版本显示「更新到 x.y.z」，一点即装；已最新则显示「已最新」 |
| 插件 → TraceScope 详情 → **更新状态卡** | 始终展开（不折叠）；可重新检查 / 更新 |
| 侧栏 TraceScope 标题旁 **「检查更新」** | 与上同一套 Host / 安装逻辑 |

说明：Host **不会**给第三方插件自动画「更新」按钮；详情页上的按钮与状态卡由 TraceScope 客户端注册（`plugins.detail.actions` + `plugins.bundle.config`）。

### 8.4 与插件市场的关系

- 社区市场卡片版本可能滞后于 npm `latest`；自更新对照的是 registry，不是市场列表。  
- 未装市场时功能完整；装了市场也只是多一条可选安装路径。  
- 桌面端若启用 `minimumReleaseAge` 等策略，极新版本可能需等待，或在 UI 中使用强制路径 / 显式 pin 版本号。

---

## 9. MCP 工具一览

包：`@rebornace/tracescope-mcp`。下表工具的执行层与 DSH Host 共用 `@rebornace/dsh-tracescope/agent-api`。

**崩溃分析**与侧栏共用 `@rebornace/dsh-tracescope/agent-api`：MCP 可完整跑 probe → list → detail → analyze → create job → publish（凭证可用工具参数或 `~/.tracescope` 已存配置）。桌面端侧栏仍走 Host `/tracescope/v1/crash-*`，会话写回工具名与 MCP 相同：`tracescope_publish_crash_analysis`（见 [§4.4](#44-分析写会话ai-回写与提交)）。

| Tool | 说明 |
|------|------|
| `tracescope_open_panel` | 打开本机可视化面板 |
| `tracescope_list_commits` | 列出仓库提交 / 引用 |
| `tracescope_get_diff` | 分页拉取统一 diff |
| `tracescope_analyze_impact` | 确定性影响面分析 |
| `tracescope_create_handtest_job` | 创建手测对话任务并返回提示词 |
| `tracescope_publish_handtest` | 写回手测清单 |
| `tracescope_start_visual_review` | 创建设计差异分析任务并返回提示词 |
| `tracescope_get_design_snapshot` | 按需拉取设计树快照 |
| `tracescope_publish_visual_findings` | 写回设计差异结论 |
| `tracescope_start_page_rematch` | 创建设计页 ↔ 文件匹配任务 |
| `tracescope_publish_page_rematch` | 写回文件匹配推荐 |
| `tracescope_crash_probe` | 校验崩溃数据源凭证；`remember` 可写入本机 |
| `tracescope_crash_filter_options` | 版本 / 系统 / 机型筛选选项 |
| `tracescope_crash_list` | 崩溃 / ANR 列表 |
| `tracescope_crash_detail` | 按 id 取详情与堆栈 |
| `tracescope_crash_analyze` | 本地堆栈解析与仓库文件命中（不调模型） |
| `tracescope_create_crash_analysis_job` | 创建 AI 任务并返回带 jobId 的提示词 |
| `tracescope_publish_crash_analysis` | 写回崩溃 AI 结论（MCP 与 DSH Host 同名） |
| `tracescope_get_crash_job` | 轮询任务状态 / 已写回结论 |

---

## 10. 已知限制

### 10.1 功能影响分析

- **云效代码接口**模式没有本地静态波及；要波及分析请用本地 Git  
- 云效截图要在详情里嵌图，需经工作项附件接口换取永久 `embedUrl`  
- GitHub Issues：截图与可附加的图片/视频会经 user-attachments 上传并写入 Issue 正文；Token 需仓库写权限（与 gh --attach 相同）。GitHub Enterprise Server 无此附件能力。
- GitLab / Webhook：仍不会像云效 / GitHub 一样上传二进制  

### 10.2 设计差异分析

- 对比为**静态**，不替代真机 / 浏览器运行时截图比对  
- 各栈 L1 属性覆盖面不一致；「能发现页面」≠「与 Android XML 增强同级」  
- **深度增强目前仅 android-xml 有实现**；其它栈开关开着也不会凭空多出布局引擎  
- 蓝湖自动匹配受项目结构 / Cookie 权限影响，可能需要手动指定代码文件  
- 设计对照图依赖 Figma / 蓝湖出图；链接过期或凭证失效时需重新对比  

### 10.3 崩溃分析

- 友盟 **Console Cookie** 取数，无 OpenAPI；Console 变更或 Cookie 过期会导致列表 / 详情失败，可粘贴堆栈继续分析  
- Crashlytics：**用户 Access Token** 约 1 小时过期；本机已 `gcloud auth login` 时可自动刷新。服务账号对 `topIssues` 完整报告支持不完整（Firebase 已知限制）  
- Crashlytics 需启用 API、可读 IAM，以及用户 Token 的**配额项目**（侧栏项目 ID → `x-goog-user-project`）  
- 国内访问 Google 依赖系统代理 / `HTTPS_PROXY`；无代理时 OAuth 与 Crashlytics 请求会失败  
- 不做 ProGuard / dSYM **符号化**；仓库命中为文件名级静态搜索，复杂 monorepo 可能误匹配  
- 友盟：版本 / 系统 / 机型为跨维度**并且**；勾选过多时控制台也会返回空列表（属预期）  
- AI 自动回写依赖会话里 Agent 调用 `tracescope_publish_crash_analysis`；未调用时可手动「回写 AI 结论」或粘贴回复  
- 无本机凭证时须在 MCP 工具参数中传入 Cookie / Token；或先在侧栏保存后再用 MCP  

### 10.4 安装与分发

- 社区插件市场卡片上的版本号可能滞后于 npm `latest`；以 npm 与侧栏实际版本为准  
- 桌面端若启用 `minimumReleaseAge` 等策略，新发布包可能需等待或显式 pin 版本号安装  
- 自更新不依赖 dshmarket；未装市场时用插件详情「更新」或 CLI 即可（见 [§8](#8-更新本插件)）  

---

## 11. 路线图与扩展计划

TraceScope 的三条能力都按**插件化横向扩展**，不绑死单一厂商：侧栏与 Host 路由保持稳定，新后端实现统一契约后注册即可。

| 扩展面 | 契约（摘要） | 当前已接入 | 可继续扩展（示例） |
|--------|----------------|------------|--------------------|
| **崩溃数据源** | `CrashProvider`（列表 / 详情 / 筛选） | 友盟 U-APM、Firebase Crashlytics、粘贴堆栈 | Sentry、Bugly、各厂商 APM 等 |
| **协作 / 缺陷平台** | `TrackerAdapter`（提交缺陷、附件策略等） | 云效、GitHub Issues、GitLab Issues、通用 Webhook | Jira、飞书 / Lark、其它工单系统等 |
| **设计稿来源** | 拉取后归一到 `DesignDoc`，再走统一静态对比 | Figma、蓝湖 | MasterGo、即时设计、其它设计协作平台等 |

代码侧栈适配（`PlatformAdapter`）与可选 **enrichment** 仍按栈扩展，与上表「外部平台」扩展正交。

**欢迎反馈优先顺序。** 若你工作中很需要某一崩溃 / APM、协作平台或设计平台，请到仓库提 [GitHub Issue](https://github.com/rebornace/dsh-tracescope/issues)（写清平台名、鉴权方式、是否有公开 API、典型使用场景）。需求明确时我会尽快适配接入。

其它规划（非本版 npm 必交付）：

- Android USB、浏览器扩展录制等  
- 仓库内 `browser-extension` 等脚手架：**未纳入当前 npm 交付**  
- 友盟 OpenAPI；Crashlytics 服务账号完整报告支持跟进上游；堆栈符号化与更准的仓库命中  
- 更多栈的 enrichment（在能力齐平前提下按需扩展，而非主路径特化）  

---

## 相关链接

- [README.md](../README.md) — 核心介绍与安装  
- [CHANGELOG.md](../CHANGELOG.md) — 版本里程碑  
- [ARCHITECTURE.md](../ARCHITECTURE.md) — 包边界与设计对比架构  
- [English guide](./GUIDE.en.md)  
- [Issues 反馈](https://github.com/rebornace/dsh-tracescope/issues) — 平台适配与功能建议
