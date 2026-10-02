# TraceScope

**Version: `0.2.4`** | [CHANGELOG](./CHANGELOG.md) | [Chinese](./README.md) | [English](./README.en.md)

TraceScope (`dsh-tracescope`) helps developers and testers with two core capabilities:

| Capability | In one line |
|------------|-------------|
| **Impact analysis** | What does this change affect? Build a verification checklist. |
| **Design diff** | Where does the implementation diverge from Figma / Lanhu? Static compare, locate, file defects. |

Primary UX: **official DeepSeek Harness Desktop** sidebar. Same capabilities over MCP from Cursor / Claude / any client.

> **Full features, workflows, enrichment, and limits** -> [docs/GUIDE.en.md](./docs/GUIDE.en.md)  
> Package boundaries -> [ARCHITECTURE.md](./ARCHITECTURE.md)

## Packages

| Package | Role |
|---------|------|
| [`@rebornace/tracescope-core`](https://www.npmjs.com/package/@rebornace/tracescope-core) | Deterministic analysis engine |
| [`@rebornace/dsh-tracescope`](https://www.npmjs.com/package/@rebornace/dsh-tracescope) | DSH plugin (Host + sidebar UI) |
| [`@rebornace/tracescope-mcp`](https://www.npmjs.com/package/@rebornace/tracescope-mcp) | MCP server (same tool surface as DSH) |

## Capabilities (summary)

**Impact analysis** - stable vs under-test: direct changes + reverse-dependency ripple; full power on local git, Codeup API for diff fallback; checklist marking, screenshots, export, and tracker filing.

**Design diff** - Figma / Lanhu as source of truth, **static** compare (not device render); major mobile / web / miniprogram stacks; layered match + property compare, optional AI write-back. Sidebar: raster, hotspot diffs, pick file, export defects.

Details (adapter deep enrichment, credential memory, limitations): [User Guide](./docs/GUIDE.en.md).

## Requirements

- Node.js `>= 20`, pnpm `9.x`
- DSH plugin: official [DeepSeek Harness Desktop](https://github.com/deepseek-ai/deepseek-harness) (recommended) or Web

## Install (official Desktop)

Package: [`@rebornace/dsh-tracescope`](https://www.npmjs.com/package/@rebornace/dsh-tracescope). Trust [npm `latest`](https://www.npmjs.com/package/@rebornace/dsh-tracescope); market cards can lag.

1. Open **Plugins**; remove an older `@rebornace/dsh-tracescope` if present
2. Add `@rebornace/dsh-tracescope@0.2.4` (or `@latest`)
3. Confirm sidebar **0.2.4+**, open **TraceScope**

CLI (optional):

```bash
dsh plugin --profile desktop remove @rebornace/dsh-tracescope
dsh plugin --profile desktop add @rebornace/dsh-tracescope@0.2.4
```

Catalogs: [awesome-deepseek-harness-plugins](https://github.com/imsai-sh/awesome-deepseek-harness-plugins)  [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)

## Development & MCP

```bash
pnpm install && pnpm build && pnpm test
```

MCP tools: [docs/GUIDE.en.md section MCP](./docs/GUIDE.en.md#7-mcp-tools). Module map example: [examples/tracescope.modules.yml](./examples/tracescope.modules.yml).

## License

MIT
