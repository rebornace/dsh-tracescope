# TraceScope

**版本: `0.1.11`**（同步默认最新分支 + 稳定/待测提交；分支筛选与个人访问令牌持久化）

功能节点见 [更新日志](./CHANGELOG.md)。下面是**当前版本**能力，不是 0.1.0 的快照。

[中文](./README.md) · [English](./README.en.md)

TraceScope（仓库名 `dsh-tracescope`）帮助测试同学从「稳定版本 → 待测版本」的代码差异，快速得到**要测哪些功能**的清单，并在 DeepSeek Harness **Web / Desktop** 右侧栏里完成勾选、备注、截图、附件与缺陷提交。

能力通过两层分发（详见 [ARCHITECTURE.md](./ARCHITECTURE.md)）：

| 表面 | 作用 |
|------|------|
| `@rebornace/tracescope-core` | 确定性影响面分析引擎（与 Agent 无关） |
| `@rebornace/tracescope-mcp` | MCP Server，供 Cursor / Claude 等任意 MCP 客户端调用 |
| `@rebornace/dsh-tracescope` | DSH 插件：Host API + 右侧栏嵌入 UI（本版本主路径） |

## 当前能力（0.1.11）

- **双 Commit 影响面**：直接变更 + 反向依赖波及（默认深度 2）。本地 Git 按**提交对象**建索引，不要求工作区文件此刻能被打开
- **支持语言（反向依赖波及）**：
  - 移动端：Kotlin、Java（与 Kotlin 互调）、Swift（与 ObjC 互调）、Objective-C、Dart/Flutter
  - Web：TypeScript / JavaScript、Vue、CSS / SCSS / Sass / Less、HTML
  - 其他语言仍列入**直接变更**（git diff 不限语言），但不推导静态波及
- **读取方式**：本地 Git，或**云效代码接口**兜底（无 Git 时只出直接变更清单；模型对话仍可读 diff）
- **远端缓存**：新同步为 bare 对象库（`~/.tracescope/repos`）。已有完整检出可继续用
- **人话功能名**：`tracescope.modules.yml` 映射 → 静态标题抽取 → 启发式命名
- **DSH 右侧栏**：多仓库、远端认证、默认同步「待测 / 稳定」版本；加载中锁定其它操作
- **生成手测清单**：确定性分析并落盘；同版本对比只保留最新一条历史
- **模型对话分析**：创建聊天任务、写入会话草稿、`tracescope_publish_handtest` 回写清单
- **勾选状态**：通过 / 失败 / 跳过 / 重置；失败可填备注 + **每条最多 3 张截图**
- **任务级附件**：视频 / 文档等挂在整份对比任务上（最多 8 个，不跟单条 checklist）
- **关联云效敏捷任务**：类型可多选，任务可多选，辅助生成清单种子 / 模型提示
- **缺陷平台**：云效 / GitHub Issues / GitLab Issues / 通用 Webhook  
  - 提交时可**修改默认标题**  
  - 云效：任务附件真实上传；截图嵌入缺陷**详情**对应条目（`![文件名](embedUrl)`）  
  - 云效目录请求可在面板查看日志（不含 token）
- **导出**：Markdown / CSV；复制失败反馈
- **本机数据**：`~/.tracescope/`（认证、缺陷配置、报告、附件、远端缓存）

## 环境要求

- Node.js `>= 20`
- pnpm `9.x`（仓库声明 `packageManager: pnpm@9.6.0`）
- 使用 DSH 插件时：已安装 DeepSeek Harness（**Web** 或 **Desktop**），并能执行 `dsh plugin`

## 安装与构建

```bash
pnpm install
pnpm build
pnpm test
```

常用命令：

```bash
# 仅构建 / 测试核心引擎
pnpm --filter @rebornace/tracescope-core build
pnpm --filter @rebornace/tracescope-core test

# 构建 DSH 插件与 MCP
pnpm --filter @rebornace/dsh-tracescope build
pnpm --filter @rebornace/tracescope-mcp build
```

## 安装到 DSH（Web / Desktop）

插件包：[`@rebornace/dsh-tracescope`](https://www.npmjs.com/package/@rebornace/dsh-tracescope)（含 `dsh.bundle` + 右侧栏 Client，Web / Desktop 同一包）。

按 [DSH 官方发布说明](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.zh.md)，优先用 **npm 预构建包**（无需 `allowBuilds`）。

### 方式一：dsh-market 插件市场搜索安装（推荐）

1. 在 DSH **Web** 或 **Desktop** 中打开 [dsh-market](https://github.com/dsh-market/dsh-market) 市场面板  
2. 搜索关键词：`tracescope`、`dsh-tracescope`、`手测` 或 `影响面`  
3. 选择 **TraceScope** / `rebornace/dsh-tracescope#dsh-tracescope`，一键安装到当前 profile  

已收录于 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)（[PR #5388](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/5388)）。npm 包带 `dsh-plugin` 等关键词，便于市场与 registry 检索。

### 方式二：命令行安装（Web 与 Desktop）

```bash
# DSH Web
dsh plugin --profile web add @rebornace/dsh-tracescope

# DSH Desktop
dsh plugin --profile desktop add @rebornace/dsh-tracescope
```

若本机默认走 npmmirror 且尚未同步到最新依赖，可临时在对应 profile 目录写入 `.npmrc`：

```ini
registry=https://registry.npmjs.org/
```

再执行上面的 `dsh plugin add`。

### 方式三：本地路径 / GitHub

```bash
pnpm --filter @rebornace/dsh-tracescope build

# Web
dsh plugin --profile web add <repo>/packages/dsh-tracescope
# Desktop
dsh plugin --profile desktop add <repo>/packages/dsh-tracescope

# 或 GitHub（需为 prepare 构建授权，见官方文档）
dsh plugin --profile web add github:rebornace/dsh-tracescope#path:packages/dsh-tracescope
dsh plugin --profile desktop add github:rebornace/dsh-tracescope#path:packages/dsh-tracescope
```

### 安装后

1. 重启 / 刷新对应 profile（Web 浏览器会话或 Desktop）  
2. 打开右侧栏 **TraceScope** 标签（新会话可能自动打开）  
3. 或在会话中使用 `/tracescope` 相关能力（Host tools + 面板）

### npm 包（0.1.11）

| 包 | 用途 |
|----|------|
| [`@rebornace/dsh-tracescope`](https://www.npmjs.com/package/@rebornace/dsh-tracescope) | DSH bundle（含 `dsh.bundle` + Client Slot），Web / Desktop 通用 |
| [`@rebornace/tracescope-core`](https://www.npmjs.com/package/@rebornace/tracescope-core) | 分析引擎（插件依赖） |
| [`@rebornace/tracescope-mcp`](https://www.npmjs.com/package/@rebornace/tracescope-mcp) | 独立 MCP Server |

## 测试同学操作流程

1. **选仓库与读取方式**：本地路径或远端 URL。默认「本地 Git」（HTTPS Token / SSH 私钥可记住）。没有 git 或缓存一直失败时，改成「云效代码接口」，地址用 `https://codeup.aliyun.com/<组织ID>/组/仓库.git`，令牌用云效 Token 或 HTTPS Token（需代码读权限）
2. **同步版本**：默认待测 = 最新提交，稳定 = 次新提交；也可手动改。云效接口模式按默认分支拉近期提交
3. **（可选）缺陷平台**：仓库配置里选云效 / GitHub / GitLab / Webhook 并保存  
   - 云效：填 token → 拉取企业 → 选项目 / 缺陷类型 / 负责人
4. **（可选）关联敏捷任务**：勾选类型 → 拉取任务 → 多选后，再点「生成手测清单」或「模型对话分析」
5. **生成清单**或**模型对话分析**（有清单时会二次确认）。云效接口模式的确定性清单只有直接变更
6. **手测勾选**：失败条目填写备注、添加截图（可选文件或 Ctrl+V）
7. **任务附件**：在清单区域上传录像 / 文档（小文件选文件；大视频可用本机绝对路径）
8. **复制失败反馈** / **提交缺陷**（可改标题） / **导出报告**

## 可选：模块映射

示例见 [examples/tracescope.modules.yml](./examples/tracescope.modules.yml)。分析时可指定该文件，把路径规则映射成产品功能名与风险等级。

## 本机数据目录

| 路径 | 内容 |
|------|------|
| `~/.tracescope/auth.json`（及认证存储） | Git 远端凭据（可选记住） |
| `~/.tracescope/tracker.json` | 缺陷平台配置 |
| `~/.tracescope/reports/` | 手测清单最新版 + 历史索引 |
| `~/.tracescope/attachments/<reportKey>/` | 任务级附件二进制 |
| `~/.tracescope/repos/` | 远端仓库本地缓存（如适用） |

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

MCP tools（0.1.0）：

| Tool | 说明 |
|------|------|
| `tracescope_open_panel` | 打开本机可视化面板 |
| `tracescope_list_commits` | 列出仓库提交 / 引用 |
| `tracescope_analyze_impact` | 确定性影响面分析 |

DSH Host 内还注册了会话侧工具（例如 `tracescope_get_diff`、`tracescope_publish_handtest`），供「模型对话分析」使用。

## 包一览

| 包 | 版本 | 说明 |
|----|------|------|
| `@rebornace/tracescope-core` | 0.1.11 | 分析、报告存储、云效 / Tracker、导出 |
| `@rebornace/dsh-tracescope` | 0.1.11 | DSH Host + React Slot Client |
| `@rebornace/tracescope-mcp` | 0.1.11 | MCP Server |
| `adapters/*`、`browser-extension` | 脚手架 | **未纳入 0.1.0 交付范围** |

## 已知限制

- **云效代码接口**模式没有本地静态波及；要波及分析请用本地 Git
- 云效截图要在详情里嵌图，需经工作项附件接口换取永久 `embedUrl`，附件列表里仍可能出现对应文件（平台能力限制）
- GitHub / GitLab / Webhook：**不会**像云效一样上传视频二进制；多为描述文本 / Webhook JSON 元数据
- 友盟 Adapter、Android USB、浏览器扩展录制等仍为后续路线图
- 插件市场卡片上的版本号不是每次 npm 发布后立刻更新

## 开发

```bash
pnpm install
pnpm -r run typecheck
pnpm test
```

架构说明：[ARCHITECTURE.md](./ARCHITECTURE.md)

## License

MIT
