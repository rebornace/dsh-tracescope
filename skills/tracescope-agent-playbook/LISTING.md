# Agensi listing copy (free skill)

Use when uploading the zip of this folder to [Agensi](https://www.agensi.io/sell).

## Title

TraceScope — Impact Checklists, Figma Diff & Crash Triage for Coding Agents

## Short description

Teach your agent when to run TraceScope MCP — and when to open the full local workbench (impact / Figma-Lanhu diff / crash) that matches the DSH plugin UI.

## Price

**Free** (non-exclusive). Engine remains MIT on GitHub/npm.

## Long description

TraceScope is an open-source toolkit for frontend and QA agents:

- **Impact** — stable vs under-test commits → manual-test checklist  
- **Visual** — static Figma / Lanhu vs code findings (not device render)  
- **Crash** — Umeng / Crashlytics / pasted stack → local match + AI write-back  
- **Workbench** — `tracescope_open_panel` opens the same three-mode UI as the DeepSeek Harness sidebar (`http://127.0.0.1:3927/`); AI prompts copy to clipboard, `publish_*` writes back  

This skill is a **playbook only**. Install `@rebornace/tracescope-mcp` separately (Node ≥ 20). DeepSeek Harness plugin `@rebornace/dsh-tracescope` embeds the same workbench in-product (composer fill); not required for MCP clients.

Links:

- https://github.com/rebornace/dsh-tracescope  
- https://www.npmjs.com/package/@rebornace/tracescope-mcp  

## Skill logo

Upload your own square logo (recommended 512×512) on the Agensi form. Do not commit logos into this repo.

## Zip contents (marketplace upload)

```
tracescope-agent-playbook/
├── SKILL.md
├── examples/prompts.md
└── reference/
    ├── install-mcp.md
    ├── impact-flow.md
    ├── visual-flow.md
    └── crash-flow.md
```

Omit `LISTING.md` and any local `outreach/` / logo files from the upload zip.
