# Architecture

## Product direction

| Surface | Role |
|---------|------|
| `@rebornace/tracescope-core` | Shared analysis engine (agent-agnostic) |
| Local panel `127.0.0.1:3927` | Visual UI for testers (agent-agnostic) |
| `@rebornace/tracescope-mcp` | **All agent capabilities** via MCP (Cursor / Claude / any MCP client) |
| `@rebornace/dsh-tracescope` | **DSH-native shell**: Host panel server + slash command + **embedded right-sidebar UI** |
| `@rebornace/dsh-tracescope/agent-api` | Shared execute layer used by both DSH tools and MCP |

Rule: every analysis / panel capability that Agents need must be reachable through MCP.  
DSH plugin’s unique value is **embedded UI inside DeepSeek Harness / Desktop**, not exclusive business logic.

## Capability map

| Capability | MCP | DSH plugin |
|------------|-----|------------|
| Open visual panel | `tracescope_open_panel` | `/tracescope` / auto-start Host server |
| List commits | `tracescope_list_commits` | tool + panel UI |
| Page git diff | `tracescope_get_diff` | tool |
| Analyze git impact | `tracescope_analyze_impact` | tool + `/tracescope` CLI mode |
| Start hand-test chat job | `tracescope_create_handtest_job` | tool + `/tracescope/v1/jobs` |
| Publish hand-test checklist | `tracescope_publish_handtest` | tool |
| Start UI review job | `tracescope_start_visual_review` | tool + sidebar「AI 协助分析」 |
| Design tree snapshot | `tracescope_get_design_snapshot` | tool |
| Publish UI findings | `tracescope_publish_visual_findings` | tool |
| Start page rematch | `tracescope_start_page_rematch` | tool + sidebar「重新推荐文件」 |
| Publish rematch picks | `tracescope_publish_page_rematch` | tool |
| Embedded in product chrome | — | Right sidebar tab (`dsh.client`) |
| Self-update (npm check / install) | — | Host `/tracescope/v1/self-update/check` + client seats (detail Update / sidebar); no MCP |
| Crash adapters / USB / extension | future MCP tools | future Host/Client surfaces |

## Design UI review (design-only)

Figma or Lanhu is the source of truth. Compare is **static** (no app runtime / native render):

1. **Discover** code pages via `PlatformAdapter` registry (`packages/core/src/design/registry.ts`)
2. **Match** design ↔ page by fingerprint (L0); near-ties prefer specialized stacks (uni-app / Taro / miniprogram / …)
3. **Compare** exact `DesignDoc` trees when the adapter can build one (L1), else heuristic text/control checks (L2)
4. **AI assist** (L3) builds a source reading list; design raster from Figma `/images` or Lanhu cover; related-file closure comes from the adapter path (or enrichment)

Adapters cover Android (XML / Compose / View), iOS (Xib / SwiftUI / UIKit), Flutter, React Native, Harmony ArkUI, Web (HTML / React / Vue / Svelte / Angular), miniprograms (WXML / AXML / TTML / Swan), uni-app, Taro, and .NET MAUI XAML.

### Enrichment (stack extras, not forks)

The main compare path (`compareDesignStatic` → `/tracescope/v1/design-compare`) is adapter-agnostic. Stacks that need more than `toDesignDoc` (e.g. Android XML layout engine + RecyclerView item expand) register a **design enrichment** plugin under `packages/dsh-tracescope/src/design-enrichment/`. Enrichments may supply related-file fingerprints and/or a code-side `DesignDoc` + wire tree; when absent, the shared path uses `toDesignDoc` / heuristic.

Legacy route `/tracescope/v1/hifi-compare` and `Hifi*` type aliases remain as compatibility shims.

## DSH note

- Host is **pure ESM** (same pattern as working community plugins such as `dsh-better-archive`).
- Client is a **React Slot** right-sidebar tab (no iframe).
- UI talks to Host over **same-origin** routes: `/tracescope/v1/*`.
- Harness can also consume `@rebornace/tracescope-mcp` via `@deepseek-ai/dsh-mcp-client` if desired.
- Shared agent execute layer: `@rebornace/dsh-tracescope/agent-api` (MCP + Host tools + `/jobs`).
- Impact-analysis indexing skips dependency/build dirs (`SKIP_DIR_NAMES`) and caches per commit in-process.

### Self-update (no dshmarket hard dependency)

| Piece | Role |
|-------|------|
| `GET /tracescope/v1/self-update/check` | Compare installed version to npm / npmmirror `latest` |
| Client `self-update.js` | Apply via official `pluginManager.installBundle` first; optional dshmarket Update API only if present; else CLI / Extension Dock copy |
| `plugins.detail.actions` | Update control next to Uninstall on the bundle detail page |
| `plugins.bundle.config` | Always-open status card on the same page (do not also register `plugins.detail.section` — duplicates the card) |
| Sidebar «检查更新» | Same check / apply path as the detail seats |

The Host does **not** auto-draw Update for third-party bundles; TraceScope registers the seats itself. Product-facing steps: [docs/GUIDE.md §7](./docs/GUIDE.md#7-更新本插件).

## Intentional non-goals (for now)

- Splitting remaining mega-files (design adapters) — high churn / risk; do in dedicated refactors.
- Deleting `panel-server.ts` legacy `/api/*` — still used by standalone MCP panel open.
- Scaffold packages `adapters/*` and `browser-extension` — out of 0.2.x delivery scope.

Product-facing limits and enrichment status: [docs/GUIDE.md](./docs/GUIDE.md) / [docs/GUIDE.en.md](./docs/GUIDE.en.md).
