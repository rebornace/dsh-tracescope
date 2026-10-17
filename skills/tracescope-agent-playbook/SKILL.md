---
name: tracescope-agent-playbook
description: >
  Use when the user asks what a git/commit change affects, needs a manual-test
  or impact checklist, wants Figma/Lanhu vs code UI review, or wants crash/ANR
  triage from Umeng, Crashlytics, or a pasted stack — and TraceScope MCP tools
  (tracescope_*) are available or should be installed.
license: MIT
metadata:
  openSource: https://github.com/rebornace/dsh-tracescope
  mcpPackage: "@rebornace/tracescope-mcp"
---

# TraceScope Agent Playbook

Orchestration guide for **TraceScope MCP**. The engine is MIT open source on npm; this skill only tells the agent **when** and **in what order** to call tools. It does not replace `@rebornace/tracescope-mcp`.

## Prerequisites

1. Node.js `>= 20`.
2. MCP server `@rebornace/tracescope-mcp` connected in the client (Cursor / Claude Code / etc.). See [reference/install-mcp.md](reference/install-mcp.md).
3. If TraceScope tools are missing, tell the user how to install MCP — do not invent analysis from git alone when the user asked for TraceScope.

## Route (pick one pillar)

| User intent signals | Pillar | Load |
|---------------------|--------|------|
| impact, what to test, hand-test checklist, regression scope, commits/diff between versions | **Impact** | [reference/impact-flow.md](reference/impact-flow.md) |
| Figma / Lanhu / design vs implementation, UI review, visual findings, page↔file match | **Visual** | [reference/visual-flow.md](reference/visual-flow.md) |
| crash, ANR, stack trace, Umeng, Crashlytics, root cause from incident | **Crash** | [reference/crash-flow.md](reference/crash-flow.md) |
| non-technical tester, wants a browser UI | Panel | Call `tracescope_open_panel` first |

If intent spans pillars, finish one publish cycle before starting the next.

## Hard rules (all pillars)

- Use TraceScope tools for real diffs, design snapshots, and stacks. Do not invent commits, files, `nodeId`s, or symbols.
- Job-based flows must **publish** with the matching `tracescope_publish_*` tool, or the panel will not refresh.
- Credentials (Figma token, Lanhu cookie, Umeng cookie, Crashlytics token) come only from the user or saved `~/.tracescope` config. Never invent, log, or hardcode secrets in the skill or replies.
- Design compare is **static** (not device/browser screenshot QA).
- Page `tracescope_get_diff` with `offset` / `limit`; never pull an entire large tree in one call.
- Prefer the user's language (zh/en) for chat summaries; keep tool JSON fields as specified by each flow.

## Example prompts

See [examples/prompts.md](examples/prompts.md).

## Source of truth

- Repo: https://github.com/rebornace/dsh-tracescope
- npm MCP: https://www.npmjs.com/package/@rebornace/tracescope-mcp
- Full product guide: `docs/GUIDE.en.md` / `docs/GUIDE.md` in the repo
- DeepSeek Harness Desktop sidebar remains the richer UX; MCP is the agent-facing surface.
