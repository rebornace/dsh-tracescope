# TraceScope User Guide

Detailed capabilities, sidebar workflows, compare layers, adapter enrichment, and known limits.  
For a short overview and install steps see [README.en.md](../README.en.md). Architecture: [ARCHITECTURE.md](../ARCHITECTURE.md).

**Version: `0.2.7`** (trust [npm `latest`](https://www.npmjs.com/package/@rebornace/dsh-tracescope) and the sidebar)

---

## 1. Three pillars

| Capability | Input | Output |
|------------|-------|--------|
| **Impact analysis** | Stable ↔ under-test (local git or Codeup API) | Direct + static ripple checklist; mark, attach, export, file defects |
| **Design diff** | Figma / Lanhu + code pages | Static diffs + design raster highlights; optional AI write-back |
| **Crash analysis** | Umeng U-APM Console (cookie) or pasted stack + code directory | Stack parse, repo file hits, bilingual report; composer draft or tracker filing |

All three share the same tracker settings (Yunxiao / GitHub / GitLab / Webhook). Design diff and crash analysis use **dedicated defect bodies** (not the impact-analysis verification template).

Primary UX: **official DeepSeek Harness Desktop** TraceScope sidebar. Same execute layer via `@rebornace/tracescope-mcp`.

### UI language

The sidebar, plugin detail / update UI, AI prompts, and Host API errors support **Chinese / English**. Language follows the Desktop (Host) UI locale — **there is no separate language toggle inside the plugin**. Unknown locales fall back to Chinese.

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

## 4. Crash analysis

Sidebar mode switch: **Impact analysis** / **Design diff** / **Crash analysis**. Crash mode reuses the **code directory** (a normal folder is enough for filename-based stack matching; git is not required) and **tracker** blocks above.

### What it does

Pull crash/ANR list and detail from **Umeng U-APM Console** via browser cookie, or **paste a stack trace** when cookie auth fails; match frames to files under the code directory; emit summary, hits, fix hints, a bilingual **`prompt`**, and a prebuilt **`defectBody`**.

### Umeng cookie (Console)

1. Sign in to [Umeng U-APM Console](https://console.umeng.com/), open the app crash list.  
2. DevTools → **Network** → any `*.umeng.com` request → copy the full **Cookie** header.  
3. Enter **AppKey** + **Cookie**, optionally **Remember credentials**, **Save**, then **Probe** (`crash-probe`) to verify. **Clear cookie** removes local storage only.  

Sidebar compliance note (`crash.cookieHint`): reads only data your logged-in session can see; cookie stays on device and requests go to Umeng hosts only. Do not share cookies.

Credentials/AppKey follow **repo override → global** (separate keys from Figma/Lanhu).

### List and seven filters

After config is ready the list loads automatically (keyword and unsaved cookie edits debounce ~400ms). Filters align with Console capabilities:

**timeRange** (24h / 7d / 30d / all, with client-side `lastSeenAt` trimming where needed), **appVersion**, **errorKind** (crash / ANR / error / other), **osDevice** (matches `osVersion` / `deviceModel`), **sort** (count / last seen / title, asc/desc), **status**, **keyword**.

Row click loads stack detail (`crash-detail`). On auth failure (e.g. `UMENG_AUTH`) the UI expands **paste stack** so analyze/submit still work.

### Analyze, write session, submit defect

1. **Analyze** — `POST /tracescope/v1/crash-analyze`: parse stack, match filenames under `repoPath`.  
2. **Write to session** — fills the Harness composer draft with `prompt` via `fillComposerDraft`; **does not send**. Dev reviews and sends to the model.  
3. **Submit defect** — requires analyze first; `feedbackKind: 'crash'` + prebuilt body (CJK escaped as `\u` in sources). Yunxiao/GitHub attachment rules match other pillars; GitLab/Webhook still skip binary uploads.

Host routes: `crash-config`, `crash-config-save`, `crash-cookie-clear`, `crash-probe`, `crash-list`, `crash-detail`, `crash-analyze`.

### Crash-specific limits (summary)

- **Console transport** only — no official OpenAPI (`transport: openapi` not implemented); Console HTML/API changes can break list/detail → update plugin or paste stack.  
- **Cookie expiry** — re-copy from browser when probe/list fails.  
- **No symbolication** — no dSYM/ProGuard mapping; repo hits are **filename** search with heuristics.  
- **Trackers** — GitLab/Webhook do not upload binaries (see [§10](#10-known-limitations)).  

---

## 5. Adapter deep enrichment

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

## 6. Credentials vs repo switch

- Design **URL** may be remembered per code repo (falls back to global)  
- Figma token / Lanhu cookie resolve **per field**: repo override → global (switching repos does not wipe a shared login with an empty override)  
- Figma and Lanhu credentials use separate keys  

---

## 7. Collaboration & local data

Trackers: Yunxiao / GitHub / GitLab / Webhook; optional Yunxiao agile work items.  
Local root: `~/.tracescope/` (auth, trackers, reports, attachments, caches).

---

## 8. Updating this plugin

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

## 9. MCP tools

Same surface as DSH Host tools via `@rebornace/dsh-tracescope/agent-api`:  
`open_panel`, `list_commits`, `get_diff`, `analyze_impact`, hand-test create/publish, visual review + snapshot + findings, page rematch create/publish.

---

## 10. Known limitations

**Impact**

- Codeup API: no local static ripple  
- Yunxiao inline images need attachment `embedUrl`s  
- GitHub Issues: screenshots (and attachable image/video) upload via user-attachments and are inlined in the issue body; token needs **repo write** access (same as `gh --attach`). Unsupported file types are skipped with an error note. GitHub Enterprise Server has no user-attachments store.
- GitLab / Webhook: still do not upload binaries like Yunxiao / GitHub  

**Design diff**

- Static only — not a substitute for device/browser screenshot compare  
- L1 coverage differs by stack; discovery ≠ Android-XML enrichment depth  
- **Only `android-xml` has an enrichment plugin today**  
- Lanhu auto-match may need a manual file pick  
- Raster URLs can expire; re-compare after credential refresh  
- Remote bare caches materialize a worktree for scanning; on Windows TraceScope enables `core.longpaths`. If checkout still fails with “Filename too long” (deep CocoaPods paths), move the TraceScope data directory to a shorter path (e.g. `D:\ts`) or enable OS long-path support, then retry (delete the stale `*-worktree` folder under the cache if needed)  

**Crash analysis**

- Umeng **Console cookie** only; cookie expiry or Console changes break list/detail — paste stack fallback  
- No **symbolication**; filename-level repo search may mis-match in large monorepos  
- Some filters may be applied locally if the remote Console call does not support them  

**Install**

- Market card versions can lag npm `latest`  
- Desktop `minimumReleaseAge` (or similar) may delay fresh publishes; pin a version if needed  
- Self-update does not need dshmarket; use the detail **Update** control or CLI ([§8](#8-updating-this-plugin))  

---

## 11. Roadmap (not in current npm)

Android USB, browser recording; `browser-extension` scaffolds. Umeng OpenAPI / more `CrashProvider`s; symbolication and sharper repo matching.

---

[中文功能说明](./GUIDE.md) · [README.en.md](../README.en.md) · [CHANGELOG](../CHANGELOG.md)
