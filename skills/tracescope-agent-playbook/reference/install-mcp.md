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

## Optional: DeepSeek Harness Desktop

For a visual sidebar (checklists, design board, crash UI), install the DSH plugin `@rebornace/dsh-tracescope` from npm. MCP and Host share the same agent-api; the sidebar is not required for agent workflows.

## Auth for private git remotes

Impact tools accept HTTPS token or SSH key parameters when `repoPath` is a remote URL. Prefer local clone paths when possible.

## Credentials store

Crash / design credentials may be saved under `~/.tracescope` (same store as the DSH sidebar). Pass credentials in tool args only when nothing is saved and the user supplies them.
