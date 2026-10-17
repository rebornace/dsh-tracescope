# Visual (design diff) flow

Static design ↔ code review. Source of truth is Figma / Lanhu (or a design URL the tools already normalize). Output is an actionable findings list — not a pixel-perfect rebuild or device screenshot QA.

## Done when

`tracescope_publish_visual_findings` (or `tracescope_publish_page_rematch` for match-only jobs) has been called for the active `jobId`.

## UI review steps

1. **Start job** — `tracescope_start_visual_review` with `repoPath`, `adapterId` (e.g. `android-xml`, `web-react`), `relativePath`, and design URL (`figmaUrl` / `designUrl`). Pass `figmaToken` / `lanhuCookie` only if the user provides them and nothing is saved.
2. **Load design context (priority)**  
   - Render URL / static diff summary from the job  
   - `tracescope_get_design_snapshot` with `jobId` (prefer a specific `nodeId`; cap with `maxNodes`)  
   - Read real source at `relativePath` — do not invent files  
3. **Findings only for real issues** — Ignore reasonable dynamic sizing / device differences. For list/pagination runtime areas, mark “runtime data uncertain” and state expected copy/structure.
4. **Publish** — `tracescope_publish_visual_findings`:
   - `jobId`
   - `findings` JSON: `[{title,severity,nodeId?,location?,expected?,actual?,codeSource?,suggestion?}]`
   - `nodeId` must come from a real snapshot / static summary id (e.g. `12:345`); leave empty if unknown — never invent ids
   - optional `summary`
5. Summarize; republish after corrections.

## Page ↔ file rematch

When the mapped code file is wrong or unknown:

1. `tracescope_start_page_rematch` (`repoPath`, `designId`, design URL, optional `adapterId` / `relativePath` / credentials).
2. Rank top 1–3 candidates from routes, page names, and copy — not filenames alone.
3. `tracescope_publish_page_rematch` with `picks`: `[{adapterId,relativePath,kindLabel?,score?,reason?}]`.

## Guardrails

- Do **not** browse figma.com or call the Figma REST API from the agent; use TraceScope tools.
- Do **not** embed data URL / base64 images in replies or tool args.
- Do **not** ask the user to paste the entire design tree into chat.

## Limits

- Static only — not a substitute for device/browser screenshot compare.
- Enrichment depth varies by stack; Lanhu auto-match may need a manual file pick.
- Raster URLs can expire; refresh credentials and re-compare if images fail.
