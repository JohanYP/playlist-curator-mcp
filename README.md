# playlist-curator-mcp

> Curation routines on top of [Navidrome](https://www.navidrome.org/) — daily ephemeral playlists, weekly auto-curated radio, and YouTube download-on-miss. **Complementary** to [`navidrome-mcp`](https://github.com/Blakeem/Navidrome-MCP) — both can be installed alongside each other.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-20%2B-339933)](https://nodejs.org)
[![npm](https://img.shields.io/badge/npm-playlist--curator--mcp-CB3837)](https://www.npmjs.com/package/playlist-curator-mcp)

An MCP server that gives any MCP-compatible assistant (Claude Desktop, OpenCode, OpenClaw, Cline, Continue.dev, etc.) the ability to **curate music** against an existing Navidrome library. Tell your assistant *"add Holocene by Bon Iver to today's playlist"* — if the track is in your library, it's added; if not, the server downloads it from YouTube via `yt-dlp`, waits for Navidrome to index it, and then adds it. At midnight today's playlist auto-deletes unless you said "save it as X". Mondays you wake up to a fresh auto-curated radio playlist.

This is a **portable npm package + CLI binary**. No Docker, no compose stack — install via `npx`/`npm` and point your MCP client at it. Audio plays in whatever Subsonic client you already use (Symfonium, DSub, Navidrome web…); this server only curates.

## Quick start (Claude Desktop)

```bash
# 1. Make sure yt-dlp and ffmpeg are on your PATH.
#    Linux:   apt install yt-dlp ffmpeg   (or pip install -U yt-dlp)
#    macOS:   brew install yt-dlp ffmpeg
#    Windows: winget install yt-dlp ffmpeg

# 2. Add to ~/.config/Claude/claude_desktop_config.json (macOS:
#    ~/Library/Application Support/Claude/claude_desktop_config.json):
```

```jsonc
{
  "mcpServers": {
    "playlist-curator": {
      "command": "npx",
      "args": ["-y", "playlist-curator-mcp@latest"],
      "env": {
        "NAVIDROME_URL": "http://192.168.1.10:4533",
        "NAVIDROME_USER": "you",
        "NAVIDROME_PASS": "your-password",
        "LIBRARY_ROOT": "/srv/music"
      }
    }
  }
}
```

Restart Claude Desktop. Open a chat and try:

> *"List my playlists."* → calls `playlist_list`
> *"Add Holocene by Bon Iver to today's playlist."* → calls `today_add`, downloads if missing
> *"Save today's playlist as 'rainy monday'."* → calls `today_save_as`
> *"What's the weekly radio looking like?"* → calls `weekly_radio_get`

Need other clients? See:
- [docs/INTEGRATION_CLAUDE_DESKTOP.md](docs/INTEGRATION_CLAUDE_DESKTOP.md)
- [docs/INTEGRATION_OPENCODE.md](docs/INTEGRATION_OPENCODE.md) (HTTP transport)
- [docs/INTEGRATION_OPENCLAW.md](docs/INTEGRATION_OPENCLAW.md)

## What it gives the assistant

| Tool | What it does |
|---|---|
| `music_search(query, limit?)` | Search the local Navidrome library |
| `playlist_list()` | Enumerate all playlists |
| `playlist_get(name)` | Tracks of a playlist |
| `playlist_create(name)` | Create empty playlist (refuses duplicates) |
| `playlist_rename(from, to)` | Rename |
| `playlist_delete(name)` | Delete permanently |
| `playlist_add(playlist, query, source?)` | High-level: search → download-on-miss → add |
| `playlist_add_tracks(playlist, track_ids)` | Low-level: append by id |
| `playlist_remove_tracks(playlist, positions)` | Remove by position |
| `today_get()` | Today's ephemeral playlist |
| `today_add(query, source?)` | Add to `today (YYYY-MM-DD)` with download-on-miss |
| `today_save_as(name)` | Promote today to permanent |
| `today_clear()` | Empty today |
| `weekly_radio_get()` | This week's `Radio Semana <YYYY-Www>` |
| `weekly_radio_regenerate()` | Force regenerate now |
| `music_download(query \| url, source?)` | Download without adding to any playlist |
| `status_now_playing()` | What's playing across connected Subsonic clients |

Full schemas and example interactions in [docs/MCP_TOOLS.md](docs/MCP_TOOLS.md).

## Standalone CLI

If you prefer to run the server yourself (HTTP mode for OpenCode-style clients, or just for testing):

```bash
npm i -g playlist-curator-mcp

navidrome-mcp init        # interactive wizard (writes ~/.config/playlist-curator-mcp/config.json)
navidrome-mcp doctor      # sanity checks: yt-dlp, ffmpeg, library, Navidrome ping
navidrome-mcp serve --transport http --port 4098
```

> Despite the npm package being `playlist-curator-mcp`, the bin is `navidrome-mcp` for ergonomic typing. (Actually the bin matches the package name — `playlist-curator-mcp ...` — there's no aliasing.)

Configuration in `$XDG_CONFIG_HOME/playlist-curator-mcp/config.json`. See [docs/CONFIGURATION.md](docs/CONFIGURATION.md).

## Why a separate MCP

[`navidrome-mcp`](https://github.com/Blakeem/Navidrome-MCP) already covers ~50 tools for general Navidrome interaction — search, playlist CRUD, lyrics, radio stations, "now playing", etc. This server intentionally stays small and focuses on workflows that don't exist there yet: **ephemeral routines** (today's playlist), **auto-curation** (weekly radio), and **download-on-miss** (yt-dlp). Both servers talk to your same Navidrome independently; you install whichever you need.

## Pre-requisites

- **Node 20+** (or just `npx` — the server downloads itself the first time).
- **yt-dlp** and **ffmpeg** on `PATH`. Both are needed for downloads.
- A **Navidrome** instance you can reach over HTTP (any version with the standard Subsonic API).

## V1.x roadmap

Out of scope for V1; tracked in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#v1x-roadmap).
- More download sources: Deezer (ARL), Spotify+spotdl, SoundCloud, Bandcamp
- Scrobble-history-based weekly radio (skip-weighted, recency-aware)
- Fuzzy query matching ("ese tema lento de los strokes")
- Playback control via Subsonic Jukebox (V2 — only if there's demand)

## Contributing

PRs and issues welcome at [github.com/JohanYP/playlist-curator-mcp](https://github.com/JohanYP/playlist-curator-mcp). Tests in `tests/`, run with `npm test`. TypeScript strict mode is non-negotiable.

## License

MIT — see [LICENSE](LICENSE).
