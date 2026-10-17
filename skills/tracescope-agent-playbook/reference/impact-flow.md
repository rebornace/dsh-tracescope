# Impact flow

Produce a manual-test impact checklist from two git refs (local path or remote URL).

## Done when

`tracescope_publish_handtest` has been called with a non-empty `items` array for the active `jobId` (or the user only asked for a markdown report from `tracescope_analyze_impact` and explicitly skipped the panel checklist).

## Steps

1. **Resolve refs** — If base/head are unknown, call `tracescope_list_commits` (`repoPath`, optional `limit` / `fetch` / auth). Confirm which commit is stable vs under-test with the user when ambiguous.
2. **Optional quick report** — `tracescope_analyze_impact` with `repoPath`, `baseCommit`, `headCommit`. Optional: `rippleDepth`, `modulesConfigPath`, `exportDir`, `fetchRemote`, auth.
3. **Page the diff when reasoning over changes** — `tracescope_get_diff` with `offset` / `limit` (default batch small; max 20 files). Advance `nextOffset` until enough context; do not request the whole tree at once.
4. **Create hand-test job** — `tracescope_create_handtest_job` → keep `jobId` and follow the starter prompt. Optional: `relatedWorkItems`, `accessMode` (`git` | `codeup`).
5. **Derive items** — Separate `direct` vs `ripple`. Each item needs actionable `suggestedSteps` and `evidence` grounded in the real diff.
6. **Publish** — `tracescope_publish_handtest`:
   - `jobId`
   - `items` JSON: `[{displayName,kind,risk,files,suggestedSteps,evidence}]`
   - `kind`: `direct` | `ripple`
   - `risk`: `high` | `medium` | `low`
7. **Summarize** in chat; republish after user corrections.

## Panel shortcut

Non-technical testers: `tracescope_open_panel` opens the local visual panel for picking repo/versions and checking off results.

## Limits

- Codeup / cloud-only modes may lack full local static ripple — prefer local git for ripple depth.
- Private remotes need HTTPS token or SSH key via tool auth params.
