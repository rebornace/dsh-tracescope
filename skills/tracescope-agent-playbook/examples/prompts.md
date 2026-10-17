# Example user prompts → pillar

| User says (examples) | Pillar |
|----------------------|--------|
| “What should QA retest between `v1.2.0` and `HEAD`?” | Impact |
| “Generate a hand-test checklist for this PR.” | Impact |
| “Compare this Figma screen to `src/pages/Checkout.tsx`.” | Visual |
| “UI doesn’t match Lanhu — find the diffs.” | Visual |
| “Which file implements this design page?” | Visual (rematch) |
| “Why is this Crashlytics issue crashing on Android 14?” | Crash |
| “Here’s a stack dump — find the root cause in this repo.” | Crash |
| “Open the TraceScope panel so I can tick test items.” | Panel → `tracescope_open_panel` |

## Minimal call shapes (reminders)

**Impact publish**

```json
{
  "jobId": "<from create_handtest_job>",
  "items": "[{\"displayName\":\"Checkout pay button\",\"kind\":\"direct\",\"risk\":\"high\",\"files\":[\"src/pay.ts\"],\"suggestedSteps\":[\"Pay with saved card\"],\"evidence\":\"diff touches pay handler\"}]"
}
```

**Visual publish**

```json
{
  "jobId": "<from start_visual_review>",
  "findings": "[{\"title\":\"Primary CTA color\",\"severity\":\"medium\",\"expected\":\"#0A84FF\",\"actual\":\"#007AFF\",\"codeSource\":\"Button.tsx\",\"suggestion\":\"Use design token\"}]",
  "summary": "1 medium issue"
}
```

**Crash publish**

```json
{
  "jobId": "<from create_crash_analysis_job>",
  "analysis": "## Root cause\n...\n## Impact\n...\n## Fix\n..."
}
```
