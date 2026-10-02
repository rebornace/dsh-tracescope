# TraceScope 功能说明

本文档说明插件的实际能力、侧栏用法、对比分层、适配器深度增强与已知限制。  
安装与一句话能力概览见仓库根目录 [README.md](../README.md)；工程结构见 [ARCHITECTURE.md](../ARCHITECTURE.md)。

**当前版本：`0.2.5`**（以 [npm `latest`](https://www.npmjs.com/package/@rebornace/dsh-tracescope) 与侧栏显示为准）

---

## 目录

1. [两条主能力](#1-两条主能力)
2. [功能影响分析](#2-功能影响分析)
3. [设计差异分析](#3-设计差异分析)
4. [适配器深度增强](#4-适配器深度增强)
5. [设计稿凭证与仓库切换](#5-设计稿凭证与仓库切换)
6. [协作平台与本机数据](#6-协作平台与本机数据)
7. [更新本插件](#7-更新本插件)
8. [MCP 工具一览](#8-mcp-工具一览)
9. [已知限制](#9-已知限制)
10. [路线图（非本版交付）](#10-路线图非本版交付)

---

## 1. 两条主能力

| 能力 | 输入 | 输出 |
|------|------|------|
| **功能影响分析** | 稳定版 ↔ 待测版（本地 Git 或云效代码接口） | 直接变更 + 静态波及清单；可标注、截图、导出、提单 |
| **设计差异分析** | Figma / 蓝湖设计稿 + 代码仓页面 | 静态差异清单 + 设计对照图高亮；可 AI 协助写回、导出、提单 |

两条能力共用侧栏里的协作平台配置（云效 / GitHub / GitLab / Webhook）。

推荐使用路径：**官方 DeepSeek Harness 桌面端**右侧栏 TraceScope 插件。同一套执行层也可通过 `@rebornace/tracescope-mcp` 在任意 MCP 客户端调用。

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

---

## 4. 适配器深度增强

### 4.1 概念

设计对比的**主路径对所有适配器一视同仁**：有 `toDesignDoc` 则走 L1，否则走 L2 启发式。

个别栈若需要「超出通用属性解析」的能力（布局引擎、动态列表还原等），以 **enrichment 插件**形式挂载，而不是在主路径里写死分叉。实现目录：

`packages/dsh-tracescope/src/design-enrichment/`

侧栏勾选 **「适配器深度增强」**（默认开启，全局记住）：

- **开**：若当前页的适配器已注册 enrichment，则使用增强结果  
- **关**：全栈统一走属性级 / 启发式，更快、粒度更一致  

对比结果标题可能显示为 `属性级 · 深度增强（adapterId）`。开关变化会写入不同缓存键，避免串结果。

### 4.2 当前已注册的增强

| 适配器 | 增强内容 | 未开启 / 无增强时 |
|--------|----------|-------------------|
| **android-xml** | 静态布局引擎（按设计稿视口量测）、依赖闭包指纹、Adapter 绑定还原列表 item、动态区域文案投影 | 与其它栈相同：`toDesignDoc` 属性级对比 |

### 4.3 尚未提供 enrichment 的栈

Compose、iOS、Flutter、RN、Web、小程序等：**不因开关而走安卓逻辑**；开关关闭时也不会降低它们已有的 L1 能力。  
后续若某栈补齐布局引擎 / 列表还原等，会作为新的 enrichment 文件注册，主路径无需再分叉。

### 4.4 与「高保真 / 代码还原预览」的关系

当前产品定位是 **设计稿静态差异分析**，不是真机渲染或代码 UI 实时预览。历史命名 `hifi-*` 已收敛为 `design-compare` / `designTree` 等；兼容别名仍保留。

---

## 5. 设计稿凭证与仓库切换

- **设计稿链接**：可按代码仓库记忆；无仓库记录时回退到全局  
- **Figma Token / 蓝湖 Cookie**：按字段「仓库覆盖 → 全局」解析；**同一设计平台登录不会因切换代码仓被空值覆盖清空**  
- Figma 与蓝湖凭证分键保存，互不覆盖  

---

## 6. 协作平台与本机数据

### 6.1 协作

- 云效 / GitHub Issues / GitLab Issues / 通用 Webhook  
- 可改默认缺陷标题；云效支持附件上传与详情内嵌图  
- 可选关联云效敏捷任务（多选类型与任务），辅助清单种子 / 提示词  

### 6.2 本机目录 `~/.tracescope/`

认证、协作配置、报告、附件、远端仓库缓存、设计对比磁盘缓存等。

---

## 7. 更新本插件

自更新**不绑定** dshmarket：官方桌面端即使未安装插件市场，也可检查与安装新版本。

### 7.1 检查从哪里来

Host 同域接口 `GET /tracescope/v1/self-update/check`：读取本包当前版本，向 **npmmirror → npmjs** 查询 `latest`，并返回是否可升级、建议安装的 spec，以及 CLI / 桌面端提示文案。

### 7.2 安装怎么走（优先级）

1. **官方插件管理器** `pluginManager.installBundle`（按检查结果装到 npm 最新版；桌面端 / Web 插件页自带）  
2. **可选**：若本机已装 dshmarket，才尝试其公开 Update API（不是前置条件）  
3. **兜底提示**：扩展坞（Extension Dock）或命令行，例如：

```bash
dsh plugin --profile desktop add @rebornace/dsh-tracescope
```

安装成功后请在**桌面端重启** Harness 使新版本生效。

### 7.3 界面入口

| 入口 | 行为 |
|------|------|
| 插件 → TraceScope 详情 → **卸载旁「更新」** | 进页自动检查；有新版本显示「更新到 x.y.z」，一点即装；已最新则显示「已最新」 |
| 插件 → TraceScope 详情 → **更新状态卡** | 始终展开（不折叠）；可重新检查 / 更新 |
| 侧栏 TraceScope 标题旁 **「检查更新」** | 与上同一套 Host / 安装逻辑 |

说明：Host **不会**给第三方插件自动画「更新」按钮；详情页上的按钮与状态卡由 TraceScope 客户端注册（`plugins.detail.actions` + `plugins.bundle.config`）。

### 7.4 与插件市场的关系

- 社区市场卡片版本可能滞后于 npm `latest`；自更新对照的是 registry，不是市场列表。  
- 未装市场时功能完整；装了市场也只是多一条可选安装路径。  
- 桌面端若启用 `minimumReleaseAge` 等策略，极新版本可能需等待，或在 UI 中使用强制路径 / 显式 pin 版本号。

---

## 8. MCP 工具一览

包：`@rebornace/tracescope-mcp`。执行层与 DSH 共用 `@rebornace/dsh-tracescope/agent-api`。

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

---

## 9. 已知限制

### 9.1 功能影响分析

- **云效代码接口**模式没有本地静态波及；要波及分析请用本地 Git  
- 云效截图要在详情里嵌图，需经工作项附件接口换取永久 `embedUrl`  
- GitHub / GitLab / Webhook：**不会**像云效一样上传视频二进制  

### 9.2 设计差异分析

- 对比为**静态**，不替代真机 / 浏览器运行时截图比对  
- 各栈 L1 属性覆盖面不一致；「能发现页面」≠「与 Android XML 增强同级」  
- **深度增强目前仅 android-xml 有实现**；其它栈开关开着也不会凭空多出布局引擎  
- 蓝湖自动匹配受项目结构 / Cookie 权限影响，可能需要手动指定代码文件  
- 设计对照图依赖 Figma / 蓝湖出图；链接过期或凭证失效时需重新对比  

### 9.3 安装与分发

- 社区插件市场卡片上的版本号可能滞后于 npm `latest`；以 npm 与侧栏实际版本为准  
- 桌面端若启用 `minimumReleaseAge` 等策略，新发布包可能需等待或显式 pin 版本号安装  
- 自更新不依赖 dshmarket；未装市场时用插件详情「更新」或 CLI 即可（见 [§7](#7-更新本插件)）  

---

## 10. 路线图（非本版交付）

- 友盟 Adapter、Android USB、浏览器扩展录制等  
- 仓库内 `adapters/*`、`browser-extension` 脚手架：**未纳入 0.2.x 交付**  
- 更多栈的 enrichment（在能力齐平前提下按需扩展，而非主路径特化）  

---

## 相关链接

- [README.md](../README.md) — 核心介绍与安装  
- [CHANGELOG.md](../CHANGELOG.md) — 版本里程碑  
- [ARCHITECTURE.md](../ARCHITECTURE.md) — 包边界与设计对比架构  
- [English guide](./GUIDE.en.md)
