# TraceScope User Guide

Detailed capabilities, sidebar workflows, compare layers, adapter enrichment, and known limits.  
For a short overview and install steps see [README.en.md](../README.en.md). Architecture: [ARCHITECTURE.md](../ARCHITECTURE.md).

**Version: `0.2.5`** (trust [npm `latest`](https://www.npmjs.com/package/@rebornace/dsh-tracescope) and the sidebar)

---

## 1. Two pillars

| Capability | Input | Output |
|------------|-------|--------|
| **Impact analysis** | Stable ↔ under-test (local git or Codeup API) | Direct + static ripple checklist; mark, attach, export, file defects |
| **Design diff** | Figma / Lanhu + code pages | Static diffs + design raster highlights; optional AI write-back |

Both share the same tracker settings (Yunxiao / GitHub / GitLab / Webhook).

Primary UX: **official DeepSeek Harness Desktop** TraceScope sidebar. Same execute layer via `@rebornace/tracescope-mcp`.

---

## 2. Impact analysis

- Direct changes + reverse-dependency ripple (default depth 2); local git indexes **commit objects**
- Ripple languages: Kotlin / Java, Swift / Objective-C, Dart/Flutter, TS / JS, Vue, CSS family, HTML
- Codeup API mode: no static ripple (chat can still read diffs)
- Product names: modules YAML → static titles → heuristics ([example](../examples/tracescope.modules.yml))
- Workflow: generate / chat → pass · fail · skip → notes & screenshots (≤3 per item) → attachments → export / submit

---

## 3. Design diff analysis

Static compare against **Figma / Lanhu** (no app/runtime screenshots).

**Discovery** covers Android (XML / Compose / View), iOS (Xib / SwiftUI / UIKit), Flutter, RN, Harmony ArkUI, Web, miniprograms, uni-app, Taro, .NET MAUI — depth varies by adapter.

| Layer | Role |
|-------|------|
| L0 | Fingerprint match (accept / pick file / AI rematch) |
| L1 | Property-level `DesignDoc` compare |
| L2 | Heuristic text / control scale |
| L3 | AI-assisted review + write-back |

API: `POST /tracescope/v1/design-compare` (alias `/hifi-compare`).

Sidebar: design URL + credential, scan, per-card compare / pick file / AI assist, multi-select highlights, related files, copy / defect / export, **Adapter deep enrichment** toggle.

| Source | Credential |
|--------|------------|
| Figma | PAT (`figd_…`) |
| Lanhu | Browser cookie (`image_id` = one screen, else project) |

---

## 4. Adapter deep enrichment

The main compare path is **adapter-agnostic** (`toDesignDoc` → L1, else L2). Extra stack logic registers as plugins under `packages/dsh-tracescope/src/design-enrichment/`.

Sidebar toggle **Adapter deep enrichment** (default on, global):

- **On** — use a registered enrichment when present for that page’s adapter  
- **Off** — same property-level / heuristic path for every stack  

### Registered today

| Adapter | Enrichment |
|---------|------------|
| **android-xml** | Static layout engine, dependency fingerprint, adapter-bound list item expand, dynamic-region text projection |

Other stacks do **not** get Android behavior when the toggle is on; turning it off does not strip their existing L1. Future enrichments register as new plugins without forking the main path.

This product is **static design diff**, not runtime UI preview. Legacy `hifi-*` names map to `design-compare` / `designTree` (aliases kept).

---

## 5. Credentials vs repo switch

- Design **URL** may be remembered per code repo (falls back to global)  
- Figma token / Lanhu cookie resolve **per field**: repo override → global (switching repos does not wipe a shared login with an empty override)  
- Figma and Lanhu credentials use separate keys  

---

## 6. Collaboration & local data

Trackers: Yunxiao / GitHub / GitLab / Webhook; optional Yunxiao agile work items.  
Local root: `~/.tracescope/` (auth, trackers, reports, attachments, caches).

---

## 7. Updating this plugin

Self-update does **not** require dshmarket. Official Desktop without the community market can still check and install.

### Check

Host route `GET /tracescope/v1/self-update/check` reads the installed version, queries **npmmirror → npmjs** for `latest`, and returns whether an upgrade exists plus CLI / Desktop hints.

### Apply (priority)

1. Official **`pluginManager.installBundle`** (installs the npm latest from the check; Desktop / Web Plugins page)  
2. **Optional**: dshmarket Update API only if the market is already installed  
3. **Fallback copy**: Extension Dock or CLI, e.g.

```bash
dsh plugin --profile desktop add @rebornace/dsh-tracescope
```

Restart Desktop Harness after a successful install.

### UI seats

| Entry | Behavior |
|-------|----------|
| Plugins → TraceScope detail → **Update next to Uninstall** | Auto-check on open; one-click install when newer |
| Plugins → TraceScope detail → **update status card** | Always expanded; re-check / update |
| Sidebar TraceScope → **Check for updates** | Same Host / install path |

The Host does not auto-draw Update for third-party bundles; TraceScope registers `plugins.detail.actions` and `plugins.bundle.config`.

### Market relationship

- Market cards can lag npm `latest`; self-update trusts the registry.  
- No market required; an installed market is only an optional apply path.  
- Desktop `minimumReleaseAge` (or similar) may delay brand-new publishes; pin a version or use a force path when offered.

---

## 8. MCP tools

Same surface as DSH Host tools via `@rebornace/dsh-tracescope/agent-api`:  
`open_panel`, `list_commits`, `get_diff`, `analyze_impact`, hand-test create/publish, visual review + snapshot + findings, page rematch create/publish.

---

## 9. Known limitations

**Impact**

- Codeup API: no local static ripple  
- Yunxiao inline images need attachment `embedUrl`s  
- GitHub / GitLab / Webhook do not upload video binaries like Yunxiao  

**Design diff**

- Static only — not a substitute for device/browser screenshot compare  
- L1 coverage differs by stack; discovery ≠ Android-XML enrichment depth  
- **Only `android-xml` has an enrichment plugin today**  
- Lanhu auto-match may need a manual file pick  
- Raster URLs can expire; re-compare after credential refresh  

**Install**

- Market card versions can lag npm `latest`  
- Desktop `minimumReleaseAge` (or similar) may delay fresh publishes; pin a version if needed  
- Self-update does not need dshmarket; use the detail **Update** control or CLI ([§7](#7-updating-this-plugin))  

---

## 10. Out of 0.2.x scope

Umeng adapter, Android USB, browser recording; scaffold packages `adapters/*` and `browser-extension`.

---

[中文功能说明](./GUIDE.md) · [README.en.md](../README.en.md) · [CHANGELOG](../CHANGELOG.md)
