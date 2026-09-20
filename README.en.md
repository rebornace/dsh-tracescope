# TraceScope

**Version: `0.1.2`** (Yunxiao project fetch hardening + in-panel request log)

[中文](./README.md) · [English](./README.en.md)

**TraceScope** (`dsh-tracescope` monorepo) turns a **stable → under-test git commit pair** into a **manual-test scope checklist**, then lets testers mark pass/fail, attach screenshots and task-level files, and submit defects—from a **DeepSeek Harness Web or Desktop** right-sidebar UI.

Distribution layers (see [ARCHITECTURE.md](./ARCHITECTURE.md)):

| Package | Role |
|---------|------|
| `@rebornace/tracescope-core` | Deterministic impact analysis (agent-agnostic) |
| `@rebornace/tracescope-mcp` | MCP server for Cursor / Claude / any MCP client |
| `@rebornace/dsh-tracescope` | DSH plugin: Host APIs + embedded sidebar UI (primary path for this release) |

## Version `0.1.0` feature set

- **Two-commit impact**: direct changes + reverse-dependency ripple (default depth 2)
- **Product-facing names**: modules YAML → static title extraction → heuristics
- **DSH sidebar**: multi-repo, remote auth, default sync of under-test / stable commits
- **Generate checklist**: deterministic analyze + persist; one history row per comparison pair
- **Chat / model analysis**: job + composer draft + `tracescope_publish_handtest`
- **Checklist status**: pass / fail / skip / reset; fail notes + **up to 3 screenshots per item**
- **Task-level attachments**: videos/docs on the whole comparison (max 8), not per checklist row
- **Yunxiao agile work items**: multi-select categories + items to seed checklist / prompts
- **Issue trackers**: Yunxiao / GitHub / GitLab / Webhook  
  - Editable default title on submit  
  - Yunxiao: uploads task attachments; embeds screenshots **in the work-item description** under each failed item (`![filename](embedUrl)`)
- **Export**: Markdown / CSV; copy fail feedback
- **Local data**: under `~/.tracescope/`

## Requirements

- Node.js `>= 20`
- pnpm `9.x` (`packageManager: pnpm@9.6.0`)
- For the DSH plugin: DeepSeek Harness (**Web** or **Desktop**) with `dsh plugin`

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

## Install into DSH (Web / Desktop)

Package: [`@rebornace/dsh-tracescope`](https://www.npmjs.com/package/@rebornace/dsh-tracescope) (`dsh.bundle` + right-sidebar Client — same package for Web and Desktop).

Per the [official DSH publish guide](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md), prefer the **prebuilt npm package** (no `allowBuilds`).

### Option 1: Search and install in dsh-market (recommended)

1. Open the [dsh-market](https://github.com/dsh-market/dsh-market) panel inside DSH **Web** or **Desktop**
2. Search for `tracescope`, `dsh-tracescope`, or `hand-test`
3. Install **TraceScope** / `rebornace/dsh-tracescope#dsh-tracescope` into the current profile

Listed in [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) ([PR #5388](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/5388)). The npm package includes `dsh-plugin` keywords for catalog / registry search.

### Option 2: CLI (Web and Desktop)

```bash
# DSH Web
dsh plugin --profile web add @rebornace/dsh-tracescope

# DSH Desktop
dsh plugin --profile desktop add @rebornace/dsh-tracescope
```

If your default registry is npmmirror and dependencies are not synced yet, add a temporary `.npmrc` in that profile directory:

```ini
registry=https://registry.npmjs.org/
```

Then re-run `dsh plugin add`.

### Option 3: Local path / GitHub

```bash
pnpm --filter @rebornace/dsh-tracescope build

dsh plugin --profile web add <repo>/packages/dsh-tracescope
dsh plugin --profile desktop add <repo>/packages/dsh-tracescope

# GitHub (requires prepare build allowance — see DSH docs)
dsh plugin --profile web add github:rebornace/dsh-tracescope#path:packages/dsh-tracescope
dsh plugin --profile desktop add github:rebornace/dsh-tracescope#path:packages/dsh-tracescope
```

### After install

1. Restart / refresh the profile (Web session or Desktop)
2. Open the **TraceScope** right-sidebar tab (may auto-open on new sessions)
3. Or use `/tracescope` Host capabilities from the session

### npm packages (0.1.2)

| Package | Role |
|---------|------|
| [`@rebornace/dsh-tracescope`](https://www.npmjs.com/package/@rebornace/dsh-tracescope) | DSH bundle (`dsh.bundle` + Client Slot) for Web and Desktop |
| [`@rebornace/tracescope-core`](https://www.npmjs.com/package/@rebornace/tracescope-core) | Analysis engine (plugin dependency) |
| [`@rebornace/tracescope-mcp`](https://www.npmjs.com/package/@rebornace/tracescope-mcp) | Standalone MCP server |

## Tester workflow (0.1.0)

1. Pick a local path or remote URL; configure HTTPS / SSH auth if needed
2. Sync versions (defaults: latest = under-test, second-latest = stable)
3. Optionally configure a defect platform (Yunxiao catalogs via token + dropdowns)
4. Optionally link Yunxiao agile work items (multi-select types + items)
5. **Generate checklist** or **Chat analysis** (confirm if overwriting)
6. Mark results; on fail, add notes and screenshots (file picker or paste)
7. Add task-level video/doc attachments
8. Copy fail feedback / submit defect (editable title) / export report

## Optional module mapping

See [examples/tracescope.modules.yml](./examples/tracescope.modules.yml).

## Local data

| Path | Contents |
|------|----------|
| `~/.tracescope/` auth store | Optional remembered git credentials |
| `~/.tracescope/tracker.json` | Defect platform config |
| `~/.tracescope/reports/` | Latest checklist + history index |
| `~/.tracescope/attachments/<reportKey>/` | Task attachment binaries |
| `~/.tracescope/repos/` | Cached remote clones (when used) |

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
| `tracescope_analyze_impact` | Deterministic impact analysis |

Additional DSH Host tools (e.g. `tracescope_get_diff`, `tracescope_publish_handtest`) support chat-driven analysis inside Web / Desktop.

## Packages

| Package | Version | Notes |
|---------|---------|-------|
| `@rebornace/tracescope-core` | 0.1.2 | Analysis, storage, Yunxiao/tracker, export |
| `@rebornace/dsh-tracescope` | 0.1.2 | DSH Host + React Slot client |
| `@rebornace/tracescope-mcp` | 0.1.2 | MCP server |
| `adapters/*`, `browser-extension` | stubs | **Out of scope for 0.1.0 delivery** |

## Known limitations (0.1.0)

- Yunxiao inline screenshots require the work-item attachment API to obtain permanent `embedUrl`s; files may still appear in the attachment list (platform constraint)
- GitHub / GitLab / Webhook do **not** upload video binaries the way Yunxiao does
- Umeng adapter, Android USB, browser recording remain roadmap items

## Development

```bash
pnpm install
pnpm -r run typecheck
pnpm test
```

See [ARCHITECTURE.md](./ARCHITECTURE.md).

## License

MIT
