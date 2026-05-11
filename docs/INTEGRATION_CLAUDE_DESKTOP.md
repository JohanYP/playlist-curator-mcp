# Integrating with Claude Desktop

Claude Desktop uses **stdio MCP transport** — it spawns the server as a subprocess and talks over stdin/stdout. Our default mode matches that, so the config is one block.

## Config file location

- Linux: `~/.config/Claude/claude_desktop_config.json`
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

## Minimal config

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

Restart Claude Desktop. The tools appear automatically.

## Pre-install vs npx

Two equivalent setups; pick whichever you prefer:

### `npx` (zero install)
Above. First conversation has a ~10s warm-up while npm caches the package; subsequent ones are instant.

### Global install
```bash
npm i -g playlist-curator-mcp
```

```jsonc
{
  "mcpServers": {
    "playlist-curator": {
      "command": "playlist-curator-mcp",
      "env": {
        "NAVIDROME_URL": "http://192.168.1.10:4533",
        ...
      }
    }
  }
}
```

## Running both `navidrome-mcp` and `playlist-curator-mcp`

They're independent processes that both talk to the same Navidrome. Register both:

```jsonc
{
  "mcpServers": {
    "navidrome": {
      "command": "npx",
      "args": ["-y", "navidrome-mcp@latest"],
      "env": { /* same Navidrome creds */ }
    },
    "playlist-curator": {
      "command": "npx",
      "args": ["-y", "playlist-curator-mcp@latest"],
      "env": { /* same Navidrome creds + LIBRARY_ROOT */ }
    }
  }
}
```

The model sees all tools across both servers and picks the right one for the task. `playlist-curator-mcp` adds 16 curator-specific tools on top of the ~50 Blakeem already ships.

## Troubleshooting

**Tools don't show up after editing the config**
Claude Desktop only re-reads the config at startup. Quit completely (not just close the window) and reopen.

**Tools show up but every call errors with "No configuration found"**
Make sure all four `env` vars are present and the values are non-empty. Variables are case-sensitive.

**Download tools fail with "Could not find yt-dlp"**
Install yt-dlp on PATH. On macOS: `brew install yt-dlp ffmpeg`. On Linux: `apt install yt-dlp ffmpeg`. Confirm with `yt-dlp --version` in a terminal Claude Desktop will inherit (often `~/.zshrc`/`~/.bashrc` PATH applies).

**"library.root does not exist"**
The path must match what Navidrome is scanning. Check Navidrome's config — `ND_MUSICFOLDER` env var or the equivalent in your install.
