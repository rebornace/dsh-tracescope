# TraceScope

**Version: `0.2.3`**

Milestones: [CHANGELOG.md](./CHANGELOG.md). [中文](./README.md) · [English](./README.en.md)

**TraceScope** (`dsh-tracescope` monorepo) helps developers and testers answer two questions:

| Capability | Question | Typical use |
|------------|----------|-------------|
| **Impact analysis** | What does this code change affect? | Pre-handoff self-review, regression scope, verification checklist |
| **Design diff analysis** | How does the implementation diverge from Figma / Lanhu? | UI review, fidelity checks, localized diffs and defect filing |

Review, marking, screenshots, attachments, and issue submission live in the **official DeepSeek Harness Desktop** (and Web) right sidebar. The same capabilities are available over MCP from Cursor / Claude or any other client.

## Packages

| Package | Role |
|---------|------|
| [`@rebornace/tracescope-core`](https://www.npmjs.com/package/@rebornace/tracescope-core) | Deterministic engine (impact indexing + design compare) |
| [`@rebornace/dsh-tracescope`](https://www.npmjs.com/package/@rebornace/dsh-tracescope) | DSH plugin: Host APIs + sidebar UI (primary path) |
| [`@rebornace/tracescope-mcp`](https://www.npmjs.com/package/@rebornace/tracescope-mcp) | MCP server, same tool surface as DSH |

See [ARCHITECTURE.md](./ARCHITECTURE.md) for details.

## Impact analysis

Given two revisions (stable → under-test, or any base → target):

- **Direct changes + reverse-dependency ripple** (default depth 2); local git indexes **commit objects**, not whatever files happen to be open in the work tree
- **Ripple languages**: Kotlin / Java, Swift / Objective-C, Dart/Flutter; TypeScript / JavaScript, Vue, CSS family, HTML. Other languages still appear in direct changes without static ripple
- **Read mode**: local git, or a **Codeup API** fallback (no static ripple; chat can still read diffs)
- **Product-facing names**: modules YAML → static titles → heuristics
- **Checklist workflow**: generate / chat analysis → pass · fail · skip → notes and screenshots (up to 3 per item) → task attachments → export Markdown / CSV → submit defects

## Design diff analysis

**Figma / Lanhu** is the source of truth. Compare is **static** (no app runtime render):

- **Page discovery**: Android (XML / Compose / View), iOS (Xib / SwiftUI / UIKit), Flutter, React Native, Harmony ArkUI, Web (HTML / React / Vue / Svelte / Angular), miniprograms, uni-app, Taro, .NET MAUI
- **Layers**: L0 fingerprint match → L1 property-level tree → L2 heuristic text / control count → L3 AI-assisted review
- **Sidebar**: design raster + diff list, multi-select highlight, pick code file, related files, copy diffs / file defects / export
- **Lanhu**: paste project or design URL + browser Cookie; `image_id` = one screen, otherwise whole project. Protocol notes were informed by community [lanhu-mcp-server](https://github.com/DC911360/lanhu-mcp-server); our adapter is original (`packages/core/src/design/sources/lanhu.ts`)

## Collaboration & local data

- **Trackers**: Yunxiao / GitHub Issues / GitLab Issues / Webhook (editable title; Yunxiao uploads attachments and embeds images in the description)
- **Optional Yunxiao agile work items** to seed checklists / prompts
- **Local dir** `~/.tracescope/`: auth, tracker config, reports, attachments, remote repo cache

## Requirements

- Node.js `>= 20`
- pnpm `9.x` (`packageManager: pnpm@9.6.0`)
- For the DSH plugin: **official DeepSeek Harness Desktop** (recommended) or Web

## Install & build

```bash
pnpm install
pnpm build
pnpm test
```

```bash
pnpm --filter @rebornace/tracescope-core build
pnpm --filter @rebornace/tracescope-core test
pnpm --filter @rebornace/dsh-tracescope build
pnpm --filter @rebornace/tracescope-mcp build
```

## Install into DeepSeek Harness (official Desktop recommended)

Package: [`@rebornace/dsh-tracescope`](https://www.npmjs.com/package/@rebornace/dsh-tracescope). **The same package works on official DeepSeek Harness Desktop and Web.**

> **Version note:** Community market cards can lag (e.g. still show `0.1.11`). Trust [npm `latest`](https://www.npmjs.com/package/@rebornace/dsh-tracescope). Install with an explicit version, or remove the old package first.

### Option 1: Official Desktop Plugins UI (recommended)

1. Install and open [DeepSeek Harness official Desktop](https://github.com/deepseek-ai/deepseek-harness)
2. Open **Plugins**; if an older build is installed, remove `@rebornace/dsh-tracescope` first
3. Follow the prompts and add: `@rebornace/dsh-tracescope@0.2.3` (or `@rebornace/dsh-tracescope@latest`)
4. Confirm the sidebar shows **0.2.3+** (includes design diff), then open the **TraceScope** tab

### Option 2: CLI (optional)

For scripting or local debugging; see the [official install guide](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md).

```bash
dsh plugin --profile desktop remove @rebornace/dsh-tracescope
dsh plugin --profile desktop add @rebornace/dsh-tracescope@0.2.3
```

### Community catalogs

Listed in:

- [awesome-deepseek-harness-plugins](https://github.com/imsai-sh/awesome-deepseek-harness-plugins) ([PR #522](https://github.com/imsai-sh/awesome-deepseek-harness-plugins/pull/522))
- [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) ([PR #5388](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/5388))

You can also browse [dsh-market](https://github.com/dsh-market/dsh-market); **the card version is not the installed version** — check npm / the sidebar.

## Workflows

### A. Impact analysis

1. Pick a repo and read mode (default: local git; Codeup API if git is unavailable)
2. Sync versions (defaults: latest = under-test, second-latest = stable)
3. Optionally configure a tracker and link agile work items
4. **Generate checklist** or **Chat analysis**
5. Mark items → attach files → copy feedback / submit defect / export

### B. Design diff analysis

1. Open the design-diff / UI-review entry in the sidebar
2. Paste a **Figma** URL (token) or **Lanhu** URL (cookie)
3. Choose the code repo and target page (accept a match, pick a file, or rematch)
4. Review the static diff list and highlights; optionally start **AI-assisted analysis**
5. Copy diffs, file defects, or export (tracker config is shared with impact analysis)

## Optional module mapping

See [examples/tracescope.modules.yml](./examples/tracescope.modules.yml).

## MCP (any agent)

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

| Tool | Purpose |
|------|---------|
| `tracescope_open_panel` | Open local visual panel |
| `tracescope_list_commits` | List commits / refs |
| `tracescope_get_diff` | Page unified diffs |
| `tracescope_analyze_impact` | Deterministic impact analysis |
| `tracescope_create_handtest_job` | Create hand-test chat job + starter prompt |
| `tracescope_publish_handtest` | Publish hand-test checklist |
| `tracescope_start_visual_review` | Start design-diff job + starter prompt |
| `tracescope_get_design_snapshot` | On-demand design tree snapshot |
| `tracescope_publish_visual_findings` | Publish design-diff findings |
| `tracescope_start_page_rematch` | Start page ↔ file rematch job |
| `tracescope_publish_page_rematch` | Publish rematch picks |

Same execute layer as DSH via `@rebornace/dsh-tracescope/agent-api`.

## Known limitations

- Codeup API mode has no local static ripple; use local git for that
- Yunxiao inline screenshots require the work-item attachment API for permanent `embedUrl`s
- GitHub / GitLab / Webhook do **not** upload video binaries the way Yunxiao does
- Design diff is static — it does not replace runtime screenshot comparison
- Umeng adapter, Android USB, browser recording remain roadmap items
- `adapters/*` and `browser-extension` are stubs — **out of 0.2.0 delivery**
- The version on the plugin-market card can lag npm `latest`

## Development

```bash
pnpm install
pnpm -r run typecheck
pnpm test
```

## License

MIT
