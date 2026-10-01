# TraceScope

**版本: `0.2.2`**

功能节点见 [更新日志](./CHANGELOG.md)。[中文](./README.md) · [English](./README.en.md)

TraceScope（仓库名 `dsh-tracescope`）帮助开发者与测试回答两类问题：

| 能力 | 解决什么 | 典型场景 |
|------|----------|----------|
| **功能影响分析** | 这次代码改动会影响哪些页面 / 模块？ | 提测前自查、划定回归范围、生成验证清单 |
| **设计差异分析** | 实现和 Figma / 蓝湖稿差在哪？ | UI 走查、还原度核对、差异定位与缺陷回传 |

核对、标注、截图、附件与 issue 提交可在 **官方 DeepSeek Harness 桌面端**（以及 Web）右侧栏完成；也可通过 MCP 在 Cursor / Claude 等客户端调用同一套能力。

## 包结构

| 包 | 作用 |
|----|------|
| [`@rebornace/tracescope-core`](https://www.npmjs.com/package/@rebornace/tracescope-core) | 确定性分析引擎（影响面索引 + 设计对比） |
| [`@rebornace/dsh-tracescope`](https://www.npmjs.com/package/@rebornace/dsh-tracescope) | DSH 插件：Host API + 右侧栏 UI（本版本主路径） |
| [`@rebornace/tracescope-mcp`](https://www.npmjs.com/package/@rebornace/tracescope-mcp) | MCP Server，与 DSH 工具面一致 |

架构细节见 [ARCHITECTURE.md](./ARCHITECTURE.md)。

## 功能影响分析

给定两个版本（稳定 → 待测，或任意基线 → 目标提交）：

- **直接变更 + 反向依赖波及**（默认深度 2）；本地 Git 按**提交对象**建索引，不要求工作区文件此刻可读
- **波及语言**：Kotlin / Java、Swift / Objective-C、Dart/Flutter；TypeScript / JavaScript、Vue、CSS 系、HTML。其他语言仍进直接变更清单，但不推导静态波及
- **读取方式**：本地 Git，或**云效代码接口**兜底（无静态波及；模型对话仍可读 diff）
- **人话功能名**：`tracescope.modules.yml` → 静态标题 → 启发式命名
- **清单工作流**：生成 / 模型对话分析 → 逐项通过·失败·跳过 → 备注与截图（每条最多 3 张）→ 任务级附件 → 导出 Markdown / CSV → 提交协作平台缺陷

## 设计差异分析

以 **Figma / 蓝湖** 设计稿为准，对代码做**静态**对比（不依赖 App 运行时渲染）：

- **页面发现**：Android（XML / Compose / View）、iOS（Xib / SwiftUI / UIKit）、Flutter、React Native、Harmony ArkUI、Web（HTML / React / Vue / Svelte / Angular）、小程序、uni-app、Taro、.NET MAUI
- **对比分层**：L0 指纹匹配 → L1 属性级静态树 → L2 启发式文案 / 控件规模 → L3 AI 协助分析
- **侧栏能力**：设计稿对照图与差异清单、多选定位高亮、指定代码文件、关联文件展开、复制差异 / 提交缺陷 / 导出报告
- **蓝湖**：粘贴项目或设计稿链接 + 浏览器 Cookie；有 `image_id` 扫单稿，否则扫项目。协议参考了社区 [lanhu-mcp-server](https://github.com/DC911360/lanhu-mcp-server)；本仓库适配器为自研（`packages/core/src/design/sources/lanhu.ts`）

## 协作与本机数据

- **协作平台**：云效 / GitHub Issues / GitLab Issues / 通用 Webhook（可改默认标题；云效支持附件上传与详情内嵌图）
- **可选关联云效敏捷任务**：多选类型与任务，辅助清单种子 / 提示词
- **本机目录** `~/.tracescope/`：认证、协作配置、报告、附件、远端仓库缓存

## 环境要求

- Node.js `>= 20`
- pnpm `9.x`（仓库声明 `packageManager: pnpm@9.6.0`）
- 使用 DSH 插件时：已安装 **官方 DeepSeek Harness 桌面端**（推荐）或 Web

## 安装与构建

```bash
pnpm install
pnpm build
pnpm test
```

```bash
# 常用分包命令
pnpm --filter @rebornace/tracescope-core build
pnpm --filter @rebornace/tracescope-core test
pnpm --filter @rebornace/dsh-tracescope build
pnpm --filter @rebornace/tracescope-mcp build
```

## 安装到 DeepSeek Harness（推荐官方桌面端）

插件包：[`@rebornace/dsh-tracescope`](https://www.npmjs.com/package/@rebornace/dsh-tracescope)。**官方 DeepSeek Harness 桌面端与 Web 使用同一包。**

> **版本注意**：社区插件市场卡片上的版本号可能滞后（例如仍显示 `0.1.11`），以 [npm `latest`](https://www.npmjs.com/package/@rebornace/dsh-tracescope) 为准。安装时请填写带版本号的包名，或先卸旧版再装最新版。

### 方式一：官方桌面端插件选项（推荐）

1. 安装并打开 [DeepSeek Harness 官方桌面端](https://github.com/deepseek-ai/deepseek-harness)
2. 打开桌面端里的 **插件** 选项；若已装旧版，先移除 `@rebornace/dsh-tracescope`
3. 按界面提示添加插件，包名建议填：`@rebornace/dsh-tracescope@0.2.2`（或 `@rebornace/dsh-tracescope@latest`）
4. 确认侧栏 / 关于里显示的版本为 **0.2.2+**（含设计差异分析）后，打开右侧栏 **TraceScope**

### 方式二：命令行（可选）

适合脚本化或本机调试；细节见 [官方安装说明](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.zh.md)。

```bash
dsh plugin --profile desktop remove @rebornace/dsh-tracescope
dsh plugin --profile desktop add @rebornace/dsh-tracescope@0.2.2
```

### 社区收录

本插件已收录于：

- [awesome-deepseek-harness-plugins](https://github.com/imsai-sh/awesome-deepseek-harness-plugins)（[PR #522](https://github.com/imsai-sh/awesome-deepseek-harness-plugins/pull/522)）
- [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)（[PR #5388](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/5388)）

也可在 [dsh-market](https://github.com/dsh-market/dsh-market) 等市场面板中搜索浏览；**市场显示版本不等于已安装版本**，请以 npm / 侧栏实际版本为准。

## 使用流程

### A. 功能影响分析

1. **选仓库与读取方式**：本地路径或远端 URL（默认本地 Git；无 git 时可改云效代码接口）
2. **同步版本**：默认同步后待测 = 最新提交、稳定 = 次新提交；可手动改
3. （可选）配置协作平台、关联敏捷任务
4. **生成清单**或**模型对话分析**
5. 逐项核对标注 → 任务附件 → 复制问题反馈 / 提交缺陷 / 导出报告

### B. 设计差异分析

1. 打开侧栏中的设计差异 / UI 走查入口
2. 粘贴 **Figma** 链接（需 Token）或 **蓝湖** 链接（需 Cookie）
3. 选择代码仓库与目标页面（可接受推荐匹配，也可指定文件 / 重新匹配）
4. 查看静态差异清单与对照图高亮；需要时发起 **AI 协助分析**
5. 复制差异、提交缺陷或导出报告（协作平台配置与功能影响分析共用）

## 可选：模块映射

示例见 [examples/tracescope.modules.yml](./examples/tracescope.modules.yml)。分析时可指定该文件，把路径规则映射成产品功能名与风险等级。

## MCP（任意 Agent）

```bash
pnpm --filter @rebornace/dsh-tracescope build
pnpm --filter @rebornace/tracescope-mcp build
```

客户端配置示例（路径改为本机绝对路径）：

```json
{
  "mcpServers": {
    "tracescope": {
      "command": "node",
      "args": ["<repo>/packages/mcp/dist/index.js"]
    }
  }
}
```

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

执行层与 DSH 共用 `@rebornace/dsh-tracescope/agent-api`。

## 已知限制

- **云效代码接口**模式没有本地静态波及；要波及分析请用本地 Git
- 云效截图要在详情里嵌图，需经工作项附件接口换取永久 `embedUrl`
- GitHub / GitLab / Webhook：**不会**像云效一样上传视频二进制
- 设计差异为静态对比，不替代真机 / 浏览器运行时截图比对
- 友盟 Adapter、Android USB、浏览器扩展录制等仍为后续路线图
- `adapters/*`、`browser-extension` 仅为脚手架，**未纳入 0.2.0 交付**
- 插件市场卡片上的版本号可能滞后于 npm `latest`

## 开发

```bash
pnpm install
pnpm -r run typecheck
pnpm test
```

## License

MIT
