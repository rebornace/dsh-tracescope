# TraceScope User Guide

Detailed capabilities, sidebar workflows, compare layers, adapter enrichment, and known limits.  
For a short overview and install steps see [README.en.md](../README.en.md). Architecture: [ARCHITECTURE.md](../ARCHITECTURE.md).

**Version: `0.3.3`** (trust [npm `latest`](https://www.npmjs.com/package/@rebornace/dsh-tracescope) and the sidebar)

---

## 1. Three pillars

| Capability | Input | Output |
|------------|-------|--------|
| **Impact analysis** | Stable ↔ under-test (local git or Codeup API) | Direct + static ripple checklist; mark, attach, export, file defects |
| **Design diff** | Figma / Lanhu + code pages | Static diffs + design raster highlights; optional AI write-back |
| **Crash analysis** | Umeng U-APM (cookie) / Firebase Crashlytics (token) or pasted stack + code directory | Stack parse, repo file hits, bilingual report; AI tool write-back; composer draft or tracker filing |

All three share the same tracker settings (Yunxiao / GitHub / GitLab / Webhook). Design diff and crash analysis use **dedicated defect bodies** (not the impact-analysis verification template).

Recommended paths:

1. **DeepSeek Harness Desktop** TraceScope right sidebar (embedded workbench + fill current-session AI prompts)  
2. **Any MCP client** (Cursor / Claude Desktop, …): configure `@rebornace/tracescope-mcp`, then call `tracescope_open_panel` for the **same three-mode workbench** as the sidebar (`127.0.0.1:3927`, APIs under `/tracescope/v1/*`). AI prompts are copied to the clipboard for paste into the agent; `publish_*` writes results back to the panel  

Execute layer and crash tools are shared via `agent-api` ([§9 MCP tools](#9-mcp-tools)).

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

Design sources are **horizontally extensible** too (fetch → vendor-neutral `DesignDoc`; the compare path is not Figma/Lanhu-only). Need MasterGo, js.design, etc.? Please [open an Issue](https://github.com/rebornace/dsh-tracescope/issues) (see [§11](#11-roadmap--extension-plans)).

---

## 4. Crash analysis

Sidebar mode switch: **Impact analysis** / **Design diff** / **Crash analysis**. Crash mode reuses the **code directory** (a normal folder is enough for filename-based stack matching; git is not required) and **tracker** blocks above.

### What it does

Pull crash/ANR list and detail from **Umeng U-APM** (China) or **Firebase Crashlytics** (global), or **paste a stack trace** when credentials fail; match frames to files under the code directory; run local analysis; write a bilingual prompt into the session and let the agent **publish** the AI conclusion back; file a dedicated tracker defect body. Switch providers in the sidebar **Provider** field.

Crash sources are **horizontally extensible** via the `CrashProvider` registry (see [§11 Roadmap & extension plans](#11-roadmap--extension-plans)): more crash / APM platforms will land over time. If you urgently need a specific platform, please [open a GitHub Issue](https://github.com/rebornace/dsh-tracescope/issues) — high-priority requests can be adapted sooner.

### Umeng cookie (Console)

1. Sign in to [Umeng U-APM Console](https://apm.umeng.com/), open the app **crash list** (`error_analysis/crash`).  
2. DevTools → **Network** → an XHR to `apm.umeng.com` (e.g. `/hsf/analysis/errorList`) → copy the full **Cookie** header (account must open that app’s crash list; include `EGG_SESS` / `umplus_uc_token`; `ctoken` optional).  
3. In the sidebar **Umeng** block enter **AppKey** + **Cookie**, keep **Remember credentials**, then **Save** or **Probe** (`crash-probe`; probe also persists when remember is on).  
4. **Clear cookie** removes local storage only.  

Sidebar compliance note (`crash.cookieHint`): reads only data your logged-in session can see; cookie stays on device and requests go to Umeng hosts only. Do not share cookies.

Credentials/AppKey are mirrored to **global** and the current repo key (normalized remote Git URL). The Umeng block is collapsible; opening a crash detail collapses it so the analysis panel stays visible.

### Crashlytics credentials (access token / service account)

For overseas Firebase projects. Environments in China need reachability to Google APIs (see proxy below).

#### Project & IAM

1. In [Firebase Console](https://console.firebase.google.com/) → Project settings, copy the **project ID** (project number also works) and the app **App ID** (e.g. `1:1234567890:ios:abcdef`).  
   - Request paths **prefer the project number** embedded in the App ID (second segment) to avoid `NOT_FOUND` from project-ID strings alone.  
2. **Enable the Firebase Crashlytics API** in [Google Cloud](https://console.cloud.google.com/apis/library/firebasecrashlytics.googleapis.com) (otherwise API-disabled / 403).  
3. For a service account: in [IAM](https://console.cloud.google.com/iam-admin/iam) grant **Firebase Crashlytics Viewer** (`roles/firebasecrashlytics.viewer`) or **Firebase Viewer** on the JSON `client_email`. Admin SDK default roles are often insufficient (`PERMISSION_DENIED`).

#### Auth (prefer access token)

| Mode | Notes |
|------|--------|
| **Access token (recommended)** | After `gcloud auth login`, run `gcloud auth print-access-token` and paste it. `ya29.` tokens expire in about **1 hour**. |
| **Local gcloud auto-refresh** | If `gcloud` is on `PATH` and logged in, TraceScope **prefers** `gcloud auth print-access-token` (~50 min cache) so you need not re-paste hourly. |
| **Service account JSON** | Paste a key with Crashlytics Viewer (long-lived, local only). Connectivity checks may pass, but full `topIssues` reports are often incomplete (404). If the Firebase console shows crashes, use a user access token. |

User-token requests send `x-goog-user-project` (sidebar project ID) for Google’s **quota project** requirement; without it you see “requires a quota project”.

#### Installing gcloud (restricted networks)

The small official installer often fails with `Download failed: SendRequest Error` when Google is blocked. With a proxy, download the **full zip** instead:

```powershell
$env:HTTPS_PROXY = 'http://127.0.0.1:7890'   # e.g. Clash
$zip = "$env:USERPROFILE\Downloads\google-cloud-cli-windows-x86_64.zip"
Invoke-WebRequest -Uri 'https://dl.google.com/dl/cloudsdk/channels/rapid/downloads/google-cloud-cli-windows-x86_64.zip' -OutFile $zip -Proxy $env:HTTPS_PROXY
Expand-Archive $zip -DestinationPath "$env:LOCALAPPDATA" -Force
& "$env:LOCALAPPDATA\google-cloud-sdk\install.bat"
# Add %LOCALAPPDATA%\google-cloud-sdk\bin to the user PATH, open a new terminal
gcloud auth login
gcloud auth print-access-token
```

#### Sidebar & proxy

1. Set Provider to **Firebase Crashlytics**, fill project ID / App ID / credentials, enable **Remember credentials** → **Save credentials**.  
2. Use the always-visible **Fetch list** button (not buried under Filters).  
3. Google reachability: system proxy or `HTTPS_PROXY` / `HTTP_PROXY` (e.g. Clash `http://127.0.0.1:7890`). OAuth, Crashlytics, and gcloud refresh share the same proxy detection.

#### Common errors

| Symptom | What to do |
|---------|------------|
| API not enabled / Enable it by visiting… | Open the link or API Library and enable Firebase Crashlytics API |
| `PERMISSION_DENIED` | Grant Crashlytics Viewer; ensure the gcloud Google account can open the Firebase project |
| Missing quota project | Fill the sidebar project ID, or `gcloud auth application-default set-quota-project <PROJECT_ID>` |
| Access token expired | `gcloud auth print-access-token` again, or rely on local gcloud auto-refresh |
| `topIssues` 404 while the app exists | Often **no crash events yet**, or SA cannot read full reports → check Console / switch to a user token |
| gcloud installer Download failed | Use the zip + proxy steps above |

### List and filters (collapsed by default)

After credentials are ready you can load the list. The **Filters** block is **collapsed by default** (one-line summary of applied conditions). Expand when needed; click **Apply filters & search** to fetch (edits alone do not hit the API). After a successful apply the block collapses again.

**Umeng:** Version / OS / device options come from the same Console meta APIs (`getVersionsList` / `getMetaosList` / `getDevices`) — **pick only**, do not type free text. Request fields are `version` / `os` / `device` arrays.

**Crashlytics:** List uses official REST `reports/topIssues`; filters map to report `filter.*` (time window, version, error type, state, keyword, …). iOS device dimension uses `topAppleDevices` (not Android `topDevices`). An empty list is expected when the app has no Crashlytics events yet.

| Filter | Notes |
|--------|--------|
| **timeRange** | 24h / 7d / 30d / 90d or custom bounds (`dateType` + `startDay` / `endDay`; do not mix presets with `custom`) |
| **appVersion** | Multi-select from Umeng versions; OR within the dimension |
| **errorKind** | crash / ANR / error / other (single selection maps to Umeng `errorType`) |
| **osVersions / deviceModels** | Multi-select from Umeng OS / device lists; **AND across dimensions** (version ∩ OS ∩ device), OR within a dimension; max **10** values per dimension (same as Console) |
| **device values** | Hardware ids such as `iPhone17,4` (not display names); commas inside an id are kept intact |
| **sort** | count / last seen / title, asc or desc |
| **status** | open / closed / other (soft local filter; list rows may omit status) |
| **keyword** | Sent as Umeng `errorAbstract` |

Row click loads stack detail (`crash-detail`). On auth failure (e.g. `UMENG_AUTH`) the UI expands **paste stack** so analyze/submit still work.

### Analyze, write session, AI write-back, submit

| Button | Typical role | Behavior |
|--------|--------------|----------|
| **Analyze** (local) | Dev & QA | `POST /tracescope/v1/crash-analyze` — parse stack, match files, show summary. **No model call**. Required before filing. |
| **Analyze & write to session** | **Developers** | Analyze if needed; create a crash AI job (`crash-ai-job`); fill the composer with a prompt that includes the **job id** (**does not send**). After send, the agent should call `tracescope_publish_crash_analysis`; the sidebar polls and **auto-writes** the green AI conclusion. If not, click **Apply AI reply** to pull, or paste then apply. |
| **Copy / Export / Submit defect** | QA etc. | Copy report, export Markdown, or file to the tracker (`feedbackKind: 'crash'` + prebuilt `defectBody`, may include AI text). Yunxiao/GitHub attachment rules match other pillars; GitLab/Webhook skip binaries. |

Host routes: `crash-config`, `crash-config-save`, `crash-cookie-clear`, `crash-probe`, `crash-filter-options`, `crash-list`, `crash-detail`, `crash-analyze`, `crash-ai-job`, `crash-job`.

Bundled skill: `tracescope-crash-analysis` (guides the agent to publish).

### Crash-specific limits (summary)

- **Console transport** only — no official OpenAPI; Console changes can break list/detail → paste stack.  
- **Cookie expiry** — re-copy from the browser when probe/list fails.  
- **Filter intersection** — heavy multi-dimension picks often return 0 rows (AND semantics). Try fewer dimensions first.  
- **No symbolication** — filename search heuristics may mis-match.  
- **Trackers** — GitLab/Webhook do not upload binaries (see [§10](#10-known-limitations)).  
- **MCP** — crash list/analyze APIs are not in `@rebornace/tracescope-mcp` yet; publish tool is registered on the DSH Host agent surface.  

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
Trackers are **horizontally extensible** via the `TrackerAdapter` registry (same idea as crash `CrashProvider` and design sources) — request Jira / Feishu / Lark etc. via [Issues](https://github.com/rebornace/dsh-tracescope/issues) (see [§11](#11-roadmap--extension-plans)).  
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

These tools share `@rebornace/dsh-tracescope/agent-api` with DSH Host.

**Crash analysis** uses the same execute layer as the sidebar: MCP can run probe → list → detail → analyze → create job → publish (credentials from tool args or saved `~/.tracescope` config). Desktop Host routes `/tracescope/v1/crash-*` remain for the sidebar UI; publish tool name matches MCP: `tracescope_publish_crash_analysis` (see [§4](#4-crash-analysis)).

| Tool | Notes |
|------|--------|
| `tracescope_open_panel` | Open local visual panel |
| `tracescope_list_commits` | List commits / refs |
| `tracescope_get_diff` | Page unified diff |
| `tracescope_analyze_impact` | Deterministic impact analysis |
| `tracescope_create_handtest_job` | Hand-test job + starter prompt |
| `tracescope_publish_handtest` | Publish hand-test checklist |
| `tracescope_start_visual_review` | Design-diff job + starter prompt |
| `tracescope_get_design_snapshot` | Design tree snapshot |
| `tracescope_publish_visual_findings` | Publish UI findings |
| `tracescope_start_page_rematch` | Page↔file rematch job |
| `tracescope_publish_page_rematch` | Publish rematch picks |
| `tracescope_crash_probe` | Verify crash credentials; optional `remember` |
| `tracescope_crash_filter_options` | Version / OS / device filter options |
| `tracescope_crash_list` | Crash / ANR list |
| `tracescope_crash_detail` | Incident detail + stack |
| `tracescope_crash_analyze` | Local stack parse + repo file match (no model) |
| `tracescope_create_crash_analysis_job` | AI job + prompt with jobId |
| `tracescope_publish_crash_analysis` | Publish crash AI conclusion (MCP + DSH Host) |
| `tracescope_get_crash_job` | Poll job status / published analysis |

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

- Umeng **Console cookie** (no OpenAPI); cookie expiry or Console changes break list/detail — paste-stack fallback  
- Crashlytics: **user access tokens** expire ~1h; auto-refresh when local `gcloud auth login` is available. Service accounts have incomplete support for full `topIssues` reports (Firebase limitation)  
- Crashlytics needs the API enabled, read IAM, and a **quota project** on user tokens (sidebar project ID → `x-goog-user-project`)  
- Reaching Google from restricted networks needs system proxy / `HTTPS_PROXY`  
- No **symbolication**; filename-level repo search may mis-match in large monorepos  
- Umeng: version / OS / device filters are **AND across dimensions**; heavy multi-select often returns 0 rows (same as Console)  
- Auto AI write-back requires the agent to call `tracescope_publish_crash_analysis`; otherwise use **Apply AI reply** or paste  
- **AI conclusion cache**: After write-back, stored under repo + incident id; local analyze restores it (no model). Clear AI cache in the sidebar to re-run.  
- Without saved credentials, pass Cookie / Token in MCP tool args; or save once in the sidebar then use MCP  

**Install**

- Market card versions can lag npm `latest`  
- Desktop `minimumReleaseAge` (or similar) may delay fresh publishes; pin a version if needed  
- Self-update does not need dshmarket; use the detail **Update** control or CLI ([§8](#8-updating-this-plugin))  

---

## 11. Roadmap & extension plans

All three pillars are built for **horizontal, pluggable extension** — TraceScope is not locked to one vendor. Sidebar UX and Host routes stay stable; new backends implement a shared contract and register.

| Extension surface | Contract (summary) | Today | Can grow (examples) |
|-------------------|--------------------|-------|---------------------|
| **Crash sources** | `CrashProvider` (list / detail / filters) | Umeng U-APM, Firebase Crashlytics, paste-stack | Sentry, Bugly, other vendor APMs |
| **Collaboration / trackers** | `TrackerAdapter` (file defects, attachment policy, …) | Yunxiao, GitHub Issues, GitLab Issues, generic Webhook | Jira, Feishu / Lark, other issue systems |
| **Design sources** | Fetch → normalize to `DesignDoc`, then shared static compare | Figma, Lanhu | MasterGo, js.design, other design tools |

Code-side `PlatformAdapter` stacks and optional **enrichment** plugins remain orthogonal to the external-platform table above.

**Feedback welcome for prioritization.** If your team urgently needs a crash / APM, tracker, or design platform, please [open a GitHub Issue](https://github.com/rebornace/dsh-tracescope/issues) (platform name, auth model, public API if any, typical workflow). Clear requests can be adapted as soon as practical.

Other items (not required for the current npm cut):

- Android USB, browser recording; in-repo `browser-extension` scaffolds (not in current npm delivery)  
- Umeng OpenAPI; fuller Crashlytics service-account report support as upstream allows; symbolication and sharper repo matching  
- More enrichment stacks when capability is on par (opt-in extras, not main-path forks)

---

[中文功能说明](./GUIDE.md) · [README.en.md](../README.en.md) · [CHANGELOG](../CHANGELOG.md) · [Issues](https://github.com/rebornace/dsh-tracescope/issues)
