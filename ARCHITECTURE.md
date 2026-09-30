# Architecture

## Product direction

| Surface | Role |
|---------|------|
| `@rebornace/tracescope-core` | Shared analysis engine (agent-agnostic) |
| Local panel `127.0.0.1:3927` | Visual UI for testers (agent-agnostic) |
| `@rebornace/tracescope-mcp` | **All agent capabilities** via MCP (Cursor / Claude / any MCP client) |
| `@rebornace/dsh-tracescope` | **DSH-native shell**: Host panel server + slash command + **embedded right-sidebar UI** |

Rule: every analysis / panel capability that Agents need must be reachable through MCP.  
DSH plugin’s unique value is **embedded UI inside DeepSeek Harness / Desktop**, not exclusive business logic.

## Capability map

| Capability | MCP | DSH plugin |
|------------|-----|------------|
| Analyze git impact | `tracescope_analyze_impact` | tool + `/tracescope` CLI mode |
| List commits | `tracescope_list_commits` | panel UI |
| Open visual panel | `tracescope_open_panel` | `/tracescope` / auto-start Host server |
| Embedded in product chrome | — | Right sidebar tab (`dsh.client`) |
| Design UI review (Figma/Lanhu vs code) | `tracescope_publish_visual_findings` + chat prompt | Visual panel + `/tracescope/v1/*` compare routes |
| Crash adapters / USB / extension | future MCP tools | future Host/Client surfaces |

## Design UI review (design-only)

Figma or Lanhu is the source of truth. Compare is **static** (no app runtime / native render):

1. **Discover** code pages via `PlatformAdapter` registry (`packages/core/src/design/registry.ts`)
2. **Match** design ↔ page by fingerprint (L0); near-ties prefer specialized stacks (uni-app / Taro / miniprogram / …)
3. **Compare** exact `DesignDoc` trees when the adapter can build one (L1), else heuristic text/control checks (L2)
4. **AI assist** (L3) builds a source reading list; design raster from Figma `/images` or Lanhu cover; Android XML still gets layout dependency closure, other stacks get entry + sibling files

Adapters cover Android (XML / Compose / View), iOS (Xib / SwiftUI / UIKit), Flutter, React Native, Harmony ArkUI, Web (HTML / React / Vue / Svelte / Angular), miniprograms (WXML / AXML / TTML / Swan), uni-app, Taro, and .NET MAUI XAML.

## DSH note

- Host is **pure ESM** (same pattern as working community plugins such as `dsh-better-archive`).
- Client is a **React Slot** right-sidebar tab (no iframe).
- UI talks to Host over **same-origin** routes: `/tracescope/v1/*`.
- Harness can also consume `@rebornace/tracescope-mcp` via `@deepseek-ai/dsh-mcp-client` if desired.
