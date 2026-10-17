# Agensi listing copy (free skill)

Use when uploading the zip of this folder to [Agensi](https://www.agensi.io/sell).

## Title

TraceScope — Impact Checklists, Figma Diff & Crash Triage for Coding Agents

## Short description

Teach your agent when to run TraceScope MCP to turn git diffs, Figma/Lanhu designs, and crash stacks into actionable test checklists and conclusions.

## Price

**Free** (non-exclusive). Engine remains MIT on GitHub/npm.

## Long description

TraceScope is an open-source toolkit for frontend and QA agents:

- **Impact** — stable vs under-test commits → manual-test checklist  
- **Visual** — static Figma / Lanhu vs code findings (not device render)  
- **Crash** — Umeng / Crashlytics / pasted stack → local match + AI write-back  

This skill is a **playbook only**. Install `@rebornace/tracescope-mcp` separately (Node ≥ 20). Optional richer UI: DeepSeek Harness Desktop plugin `@rebornace/dsh-tracescope`.

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
