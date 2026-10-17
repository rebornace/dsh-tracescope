# Install TraceScope MCP

Package: [`@rebornace/tracescope-mcp`](https://www.npmjs.com/package/@rebornace/tracescope-mcp)  
Requires Node.js `>= 20`.

## Cursor (example)

Add to MCP settings (user or project):

```json
{
  "mcpServers": {
    "tracescope": {
      "command": "npx",
      "args": ["-y", "@rebornace/tracescope-mcp"]
    }
  }
}
```

Restart the MCP client after changing config. Confirm tools named `tracescope_*` appear.

## Claude Code / other stdio MCP hosts

Same pattern: run `npx -y @rebornace/tracescope-mcp` as a stdio MCP server. Adapt the host’s MCP config schema accordingly.

## Claude.ai / Desktop custom connectors (URL only)

Custom connectors do **not** accept local stdio. Anthropic’s cloud must reach a public HTTPS MCP endpoint.

1. From the repo: `pnpm --filter @rebornace/tracescope-mcp run build`
2. Start Streamable HTTP (token recommended when tunneling):

```bash
set TRACESCOPE_MCP_TOKEN=your-secret
set TRACESCOPE_MCP_ALLOWED_HOSTS=your-tunnel-host.example
pnpm --filter @rebornace/tracescope-mcp run start:http
```

3. Tunnel `http://127.0.0.1:3847` (ngrok / cloudflared). Prefer cloudflared over free localtunnel (fewer interstitial blocks).
4. In Claude → Customize → Connectors → Add custom connector:
   - URL: `https://<tunnel-host>/mcp`
   - Request header: `Authorization` = `Bearer your-secret`

Shut the tunnel down when finished; the HTTP surface can read local repos and `~/.tracescope` credentials.

## Visual workbench (same as DSH sidebar)

With MCP connected, ask the agent to call `tracescope_open_panel`. That opens the **full TraceScope workbench** at `http://127.0.0.1:3927/` (impact / design diff / crash), backed by the same `/tracescope/v1/*` APIs as the DSH plugin sidebar.

- Click through analysis, checklists, design board, and crash triage in the browser.
- “AI analysis” copies a starter prompt to the clipboard — paste into Claude/Cursor; after the agent calls `tracescope_publish_*`, the panel refreshes.

Optional: DeepSeek Harness Desktop embeds the same UI in a right sidebar and can fill the session composer directly (`@rebornace/dsh-tracescope`).

## Auth for private git remotes

Impact tools accept HTTPS token or SSH key parameters when `repoPath` is a remote URL. Prefer local clone paths when possible.

## Credentials store

Crash / design credentials may be saved under `~/.tracescope` (same store as the DSH sidebar). Pass credentials in tool args only when nothing is saved and the user supplies them.
