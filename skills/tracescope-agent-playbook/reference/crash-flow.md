# Crash flow

Triage crash / ANR from the **Local crash capture** (test-time USB), Umeng U-APM, or Firebase Crashlytics. Sidebar write-to-session quietly runs stack prep (`crash-analyze`: soft file hints, no model) then creates an AI job. AI conclusion is produced by the agent, then published.

## Done when

`tracescope_publish_crash_analysis` has been called with a full `analysis` for the active crash `jobId`, or the user only needed stack prep / copy / export and skipped AI publish.

## Steps

1. **Source** — `provider=local` for the disk inbox; Umeng/Crashlytics need saved `~/.tracescope` credentials (or tool args). Never invent cookies/tokens. Inbox never uploads to APM.
2. **Capture (local only, optional)** — `tracescope_crash_inbox_devices` → `tracescope_crash_inbox_capture_start` (Android adb; iOS macOS-only). Stop with `tracescope_crash_inbox_capture_stop`. Sidebar no longer offers paste-stack; for agents with raw stack text, pass an `incident` JSON to analyze/job directly.
3. **List / filter (optional)** — `tracescope_crash_filter_options` then `tracescope_crash_list`. Heavy multi-select on Umeng often returns 0 rows — narrow filters.
4. **Detail** — `tracescope_crash_detail` with incident `id` from the list (or build `incident` from stackText when calling tools directly).
5. **Prep (quiet)** — `tracescope_crash_analyze` with `repoPath` and `incident` JSON. Returns summary, optional `matchedFiles` (hints), `fixHints`. Empty matches are fine — continue with the full stack. Sidebar does this automatically before write-session / copy / export / submit.
6. **AI job** — `tracescope_create_crash_analysis_job` with `repoPath`, `summary`, `incident`, optional `stackText` / `matchedFiles` / `fixHints` / `lang` / `analysisKind`. Prefer `analysisKind=reproduce` (reproduction steps for teammates). Use `fix` only when the user wants root cause + minimal fix. Keep `jobId`.
7. **Reason** — Match `analysisKind`: for `reproduce`, write preconditions / steps / expected vs actual only (no root cause, no fix, no code changes). For `fix`, root cause, impact, minimal fix grounded in the stack. Do not invent symbols or paths.
8. **Publish** — `tracescope_publish_crash_analysis` (`jobId`, `analysis`, optional `lang`). `analysis` must match the job kind. Poll with `tracescope_get_crash_job` if needed.
9. Summarize in chat; republish after corrections.

## Limits

- Local crash capture: Android USB needs `adb` (auto-downloaded under `~/.tracescope/tools` when missing); iOS USB needs macOS + `idevicecrashreport` (libimobiledevice). Windows cannot live-capture iOS.
- Umeng uses Console cookie (no OpenAPI); expiry breaks list/detail — refresh credentials.
- Crashlytics user access tokens expire ~1h; service accounts have incomplete topIssues support.
- Restricted networks may need system proxy / `HTTPS_PROXY` for Google APIs.
- File matches are optional hints; if empty, rely on the stack text in the analysis.
