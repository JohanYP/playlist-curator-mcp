# playlist-curator-mcp

> Curation routines on top of Navidrome — daily ephemeral playlists, weekly auto-curated radio, and YouTube download-on-miss. **Complementary** to [`navidrome-mcp`](https://github.com/Blakeem/Navidrome-MCP).

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-20%2B-339933)](https://nodejs.org)

A minimal MCP server that adds **three things** to any Navidrome-driven setup:

1. **`today` playlist** that auto-rolls over at midnight unless you save it.
2. **`Radio Semana <N>`** weekly playlist regenerated every Monday from your listening history.
3. **YouTube download-on-miss** via yt-dlp — if you ask to add a track that isn't in your library, the server downloads it and drops it where Navidrome will index it.

For everything else (search, basic playlist CRUD, lyrics, radio stations, library info) install the excellent [`navidrome-mcp`](https://github.com/Blakeem/Navidrome-MCP) alongside this one. They both talk to your same Navidrome server independently.

## Status

🚧 **V0.1.0 in development.** Phase 0 (skeleton + CLI) is in. Phases 1-8 to follow. See [the plan](https://github.com/JohanYP/playlist-curator-mcp/blob/main/docs/ROADMAP.md) once it's published.

## Quick start (preview — won't fully work until Phase 2)

```bash
npx -y playlist-curator-mcp init       # interactive wizard (Phase 6)
npx -y playlist-curator-mcp doctor     # sanity checks
npx -y playlist-curator-mcp serve      # default: stdio transport
```

### Claude Desktop config (when Phase 2 lands)

```jsonc
// ~/.config/Claude/claude_desktop_config.json
{
  "mcpServers": {
    "navidrome-curator": {
      "command": "npx",
      "args": ["-y", "playlist-curator-mcp@latest"],
      "env": {
        "NAVIDROME_URL": "http://192.168.1.10:4533",
        "NAVIDROME_USER": "you",
        "NAVIDROME_PASS": "...",
        "LIBRARY_ROOT": "/srv/music"
      }
    },
    "navidrome": {
      "command": "npx",
      "args": ["-y", "navidrome-mcp@latest"],
      "env": { /* same Navidrome creds */ }
    }
  }
}
```

## Pre-requisites

- Node 20+
- `yt-dlp` and `ffmpeg` on `PATH` (required for downloads)
- A running Navidrome instance (any version with the standard Subsonic API)

## What it exposes (target V1 tool surface)

| Tool | Purpose |
|---|---|
| `today_get` | List tracks in today's ephemeral playlist |
| `today_add(query)` | Add to today (with download-on-miss) |
| `today_save_as(name)` | Promote today to a permanent playlist |
| `today_clear` | Empty today's playlist |
| `weekly_radio_get` | Current auto-curated weekly playlist |
| `weekly_radio_regenerate` | Force regenerate now |
| `music_download(query \| url, source?)` | Download a track from external source |

## Why a separate MCP

`navidrome-mcp` already covers ~50 tools for search, CRUD, lyrics, radio stations, etc. This server intentionally stays small and focuses on the workflows that don't exist there yet. "Do one thing well" — both servers stay simple and the user picks both.

## License

MIT — see [LICENSE](LICENSE).
