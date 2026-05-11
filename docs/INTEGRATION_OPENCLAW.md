# Integrating with OpenClaw / Cline / Continue.dev / OpenFang

These clients all use **stdio MCP** — same as Claude Desktop. The integration is essentially identical: a JSON config block pointing at the `playlist-curator-mcp` binary (via `npx` or a global install) with the four Navidrome env vars.

Find your client's MCP config file (it varies):

| Client | Config file |
|---|---|
| Claude Desktop | `~/.config/Claude/claude_desktop_config.json` (Linux) |
| OpenClaw | check the project's docs (typically `~/.openclaw/config.json` or via UI) |
| Cline (VS Code extension) | VS Code settings → `cline.mcpServers` |
| Continue.dev | `~/.continue/config.json` → `mcpServers` block |
| OpenFang | check the project's docs |

In every case the block looks the same:

```jsonc
{
  "mcpServers": {
    "playlist-curator": {
      "command": "npx",
      "args": ["-y", "playlist-curator-mcp@latest"],
      "env": {
        "NAVIDROME_URL": "http://192.168.1.10:4533",
        "NAVIDROME_USER": "your-username",
        "NAVIDROME_PASS": "your-password",
        "LIBRARY_ROOT": "/srv/music"
      }
    }
  }
}
```

Reload / restart the client. The tools appear automatically.

For HTTP-based clients (OpenCode and similar), see [INTEGRATION_OPENCODE.md](INTEGRATION_OPENCODE.md).

## What about Anthropic's API directly?

If you're building your own MCP-aware app on top of the Anthropic SDK or another LLM, the official `@modelcontextprotocol/sdk` Client class can connect to either stdio or HTTP. Pseudocode:

```ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "npx",
  args: ["-y", "playlist-curator-mcp@latest"],
  env: { NAVIDROME_URL: "...", NAVIDROME_USER: "...", NAVIDROME_PASS: "...", LIBRARY_ROOT: "..." },
});
const client = new Client({ name: "my-app", version: "0.0.1" });
await client.connect(transport);

const tools = await client.listTools();
const result = await client.callTool({ name: "today_get", arguments: {} });
```

That's the same surface every client uses internally; only the wrapper UI differs.
