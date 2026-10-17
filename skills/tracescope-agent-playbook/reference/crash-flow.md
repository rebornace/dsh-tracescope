# Crash flow

Triage crash / ANR from Umeng U-APM, Firebase Crashlytics, or a pasted stack. Local analyze parses the stack and matches repo files (no model). AI conclusion is produced by the agent, then published.

## Done when

`tracescope_publish_crash_analysis` has been called with a full `analysis` for the active crash `jobId`, or the user only asked for local analyze output and skipped AI publish.

## Steps

1. **Credentials** — Prefer saved `~/.tracescope` config. If missing, ask the user for provider credentials and optionally `tracescope_crash_probe` with `remember=true` after a successful probe. Never invent cookies/tokens.
2. **List / filter (optional)** — `tracescope_crash_filter_options` then `tracescope_crash_list` (`timeRange`, versions, OS, devices, `errorKind`, etc.). Heavy multi-select on Umeng often returns 0 rows — narrow filters.
3. **Detail** — `tracescope_crash_detail` with incident `id`, **or** use pasted `stackText` when the console is unavailable.
4. **Local analyze** — `tracescope_crash_analyze` with `repoPath` and `incident` JSON (preferred) or `stackText`. Returns summary, `matchedFiles`, `fixHints` (filename-level match; no symbolication).
5. **AI job** — `tracescope_create_crash_analysis_job` with `repoPath`, `summary`, `incident`, optional `stackText` / `matchedFiles` / `fixHints` / `lang`. Keep `jobId`.
6. **Reason** — Root cause, impact, minimal fix grounded in the stack and matched files only. Do not invent symbols or paths.
7. **Publish** — `tracescope_publish_crash_analysis` (`jobId`, `analysis`, optional `lang`). Poll with `tracescope_get_crash_job` if needed.
8. Summarize in chat; republish after corrections.

## Limits

- Umeng uses Console cookie (no OpenAPI); expiry breaks list/detail — fall back to paste-stack.
- Crashlytics user access tokens expire ~1h; service accounts have incomplete topIssues support.
- Restricted networks may need system proxy / `HTTPS_PROXY` for Google APIs.
- Large monorepos: filename match can be ambiguous — say so in the analysis.
