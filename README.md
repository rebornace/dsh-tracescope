# TraceScope

**版本: `0.3.0`** · [更新日志](./CHANGELOG.md) · [中文](./README.md) · [English](./README.en.md)

TraceScope（仓库名 `dsh-tracescope`）面向开发与测试的三项核心能力：

| 能力 | 一句话 |
|------|--------|
| **功能影响分析** | 这次改动影响哪些页面 / 模块？生成可勾选的验证清单 |
| **设计差异分析** | 实现与 Figma / 蓝湖稿差在哪？静态对比、定位差异并回传缺陷 |
| **崩溃分析** | 友盟 U-APM 或粘贴堆栈 → 对照代码目录生成报告，AI 写回结论，写会话或提交缺陷 |

推荐在 **官方 DeepSeek Harness 桌面端** 右侧栏使用。**功能影响分析**与**设计差异分析**可通过 MCP 在 Cursor / Claude 等客户端调用；**崩溃分析**列表 / 分析走 Host 侧栏（`/tracescope/v1/crash-*`），会话内可通过 `tracescope_publish_crash_analysis` 自动写回（MCP 包尚未对等暴露列表接口）。

界面语言（中/英）**跟随桌面端 / Host 界面语言**，与系统设置一致，插件内无需单独切换。

> **详细功能、侧栏流程、深度增强与已知限制** → [docs/GUIDE.md](./docs/GUIDE.md)  
> 工程边界与包职责 → [ARCHITECTURE.md](./ARCHITECTURE.md)

## 包

| 包 | 作用 |
|----|------|
| [`@rebornace/tracescope-core`](https://www.npmjs.com/package/@rebornace/tracescope-core) | 确定性分析引擎 |
| [`@rebornace/dsh-tracescope`](https://www.npmjs.com/package/@rebornace/dsh-tracescope) | DSH 插件（Host + 侧栏 UI） |
| [`@rebornace/tracescope-mcp`](https://www.npmjs.com/package/@rebornace/tracescope-mcp) | MCP Server（与 DSH 工具面一致） |

## 核心能力（摘要）

**功能影响分析** — 稳定版 ↔ 待测版：直接变更 + 反向依赖波及；本地 Git 全量能力，云效代码接口可兜底读 diff；清单标注、截图、导出与协作提单。

**设计差异分析** — 以 Figma / 蓝湖为真源做静态对比（非真机渲染）；覆盖主流移动 / Web / 小程序栈；分层匹配与属性对比，可选 AI 协助写回。侧栏支持对照图、差异定位、指定文件与缺陷导出。

**崩溃分析** — 友盟 U-APM Console Cookie 拉列表 / 详情（筛选默认可折叠，版本 / 系统 / 机型与控制台同源勾选）或粘贴堆栈降级；堆栈解析与仓库文件命中；「分析并写入会话」+ Agent 工具写回 AI 结论；测试「提交缺陷」（专用 crash 正文）。

完整说明（含适配器深度增强、凭证记忆、限制清单）见 [功能说明](./docs/GUIDE.md)。

## 环境

- Node.js `>= 20`，pnpm `9.x`
- DSH 插件：官方 [DeepSeek Harness 桌面端](https://github.com/deepseek-ai/deepseek-harness)（推荐）或 Web

## 安装（官方桌面端）

插件包：[`@rebornace/dsh-tracescope`](https://www.npmjs.com/package/@rebornace/dsh-tracescope)。**以 [npm `latest`](https://www.npmjs.com/package/@rebornace/dsh-tracescope) 为准**；社区市场卡片版本可能滞后。

1. 打开桌面端 **插件**；若已装旧版，先移除 `@rebornace/dsh-tracescope`
2. 添加：`@rebornace/dsh-tracescope`
3. 打开 **TraceScope**；之后可用插件详情 / 侧栏的「更新」跟进新版本

命令行（可选）：

```bash
dsh plugin --profile desktop remove @rebornace/dsh-tracescope
dsh plugin --profile desktop add @rebornace/dsh-tracescope
```

社区收录：[awesome-deepseek-harness-plugins](https://github.com/imsai-sh/awesome-deepseek-harness-plugins) · [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)

### 更新本插件

**不依赖**社区插件市场（dshmarket）。对照 [npm `latest`](https://www.npmjs.com/package/@rebornace/dsh-tracescope) 后：

| 入口 | 说明 |
|------|------|
| **插件详情 → 卸载旁「更新」** | 进页自动检查；有新版本一点即装（官方插件管理器优先） |
| **插件详情 → 更新状态卡** | 始终展开，可重新检查 / 更新 |
| **侧栏 TraceScope →「检查更新」** | 同一套逻辑 |
| **命令行** | `dsh plugin --profile desktop add @rebornace/dsh-tracescope` 后重启 |

更新后请在桌面端重启 Harness。完整说明见 [功能说明 · 更新本插件](./docs/GUIDE.md#8-更新本插件)。

## 开发与 MCP

```bash
pnpm install && pnpm build && pnpm test
```

MCP 配置与工具列表见 [docs/GUIDE.md § MCP](./docs/GUIDE.md#9-mcp-工具一览)。模块映射示例：[examples/tracescope.modules.yml](./examples/tracescope.modules.yml)。

## License

MIT
