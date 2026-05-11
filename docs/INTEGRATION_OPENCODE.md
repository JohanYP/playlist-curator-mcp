# Integrating with OpenCode

OpenCode consumes MCP servers over **HTTP** (its `mcp` config block expects a `url`, not a subprocess command). You run `playlist-curator-mcp` as a long-lived HTTP server and point OpenCode at it.

## One-time setup

```bash
# Install once
npm i -g playlist-curator-mcp

# Interactive config — writes ~/.config/playlist-curator-mcp/config.json
navidrome-mcp init
```

You should see `✓ Navidrome accepted the credentials` and `✓ Config written ...`. Run a sanity check:

```bash
navidrome-mcp doctor
```

## Running the server

```bash
navidrome-mcp serve --transport http --port 4098
```

For production-ish use, put it under a process supervisor. Two simple recipes:

### systemd (Linux)

`~/.config/systemd/user/playlist-curator-mcp.service`:

```ini
[Unit]
Description=playlist-curator-mcp
After=network-online.target

[Service]
ExecStart=/usr/bin/playlist-curator-mcp serve --transport http --port 4098
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
```

```bash
systemctl --user daemon-reload
systemctl --user enable --now playlist-curator-mcp
journalctl --user -u playlist-curator-mcp -f
```

### launchd (macOS)

`~/Library/LaunchAgents/com.johanyp.playlist-curator-mcp.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.johanyp.playlist-curator-mcp</string>
  <key>ProgramArguments</key>
  <array>
    <string>/opt/homebrew/bin/playlist-curator-mcp</string>
    <string>serve</string>
    <string>--transport</string><string>http</string>
    <string>--port</string><string>4098</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardErrorPath</key><string>/tmp/playlist-curator-mcp.log</string>
</dict>
</plist>
```

```bash
launchctl load ~/Library/LaunchAgents/com.johanyp.playlist-curator-mcp.plist
```

## OpenCode config

Add to `opencode.json` (next to your existing config):

```jsonc
{
  "mcp": {
    "playlist-curator": {
      "type": "remote",
      "url": "http://127.0.0.1:4098/mcp"
    }
  }
}
```

If you also want to register the Blakeem `navidrome-mcp` complementarily — it ships as a stdio binary, not HTTP, so OpenCode can't consume it directly. For OpenCode, the curator alone is enough; the model can do the basic CRUD via `playlist_*` tools we ship.

## Behind Opencode-Assistant (the Docker bot)

Your `Opencode-Assistant` Docker stack runs OpenCode inside a container. To make `playlist-curator-mcp` reachable from the bot:

1. Run `playlist-curator-mcp serve --transport http --port 4098` on the **host** (not in Docker — the server doesn't ship a Docker image by design).
2. In the bot's `.env`:
   ```bash
   PLAYLIST_CURATOR_MCP_URL=http://host.docker.internal:4098/mcp
   ```
3. The bot's `docker/opencode-entrypoint.sh` merges this into the OpenCode container's `opencode.json` automatically (same pattern as `ASSISTANT_MEMORY_MCP_URL`).

## Verification

```bash
curl -X POST http://127.0.0.1:4098/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0.0.1"}}}'
```

You should get back a server-info response with `protocolVersion: "2024-11-05"` and a tools capability.
