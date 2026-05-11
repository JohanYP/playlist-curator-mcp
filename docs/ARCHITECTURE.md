# Architecture

## Why this project exists

`navidrome-mcp` (by Blakeem) ships an excellent generic MCP server for Navidrome — 50+ tools for search, playlist CRUD, lyrics, radio stations, library info, etc. This server intentionally stays small and adds the three workflows that `navidrome-mcp` doesn't:

- **Ephemeral routines** — today's playlist that auto-rolls over at midnight.
- **Auto-curation** — weekly radio regenerated each Monday from listening data.
- **Download-on-miss** — yt-dlp integration so the assistant can grow your library conversationally.

Both servers can run side by side. They're independent processes that both talk to the same Navidrome.

## Process layout

```
┌──────────────────────────────────────────────────────────┐
│                    MCP client (your choice)              │
│  Claude Desktop · OpenCode · OpenClaw · Cline · etc.     │
└────────┬─────────────────────────────────────────────────┘
         │ stdio (default)  /  HTTP (--transport=http)
         ▼
┌──────────────────────────────────────────────────────────┐
│              playlist-curator-mcp (this project)         │
│                                                          │
│   16 MCP tools across 5 domains:                         │
│   - search · playlist · today · radio · download         │
│                                                          │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│   │  Subsonic    │  │  yt-dlp      │  │  croner      │   │
│   │  client      │  │  subprocess  │  │  scheduler   │   │
│   └──────┬───────┘  └──────┬───────┘  └──────┬───────┘   │
│          │                 │                 │           │
└──────────┼─────────────────┼─────────────────┼───────────┘
           │                 │                 │
           │ Subsonic API    │ writes mp3      │ fires:
           ▼                 ▼                 │ - daily rollover
   ┌──────────────┐   ┌──────────────┐         │ - weekly radio regen
   │  Navidrome   │ ◀─┤  library     │ ◀───────┘
   │  (you run    │   │  filesystem  │
   │   it)        │   │              │
   └──────┬───────┘   └──────────────┘
          │
          ▼  Subsonic API (playback)
   ┌──────────────────────────────────────────────────┐
   │  Subsonic clients (your choice)                  │
   │  Symfonium · DSub · Sonixd · Navidrome web ...   │
   └──────────────────────────────────────────────────┘
```

Audio playback happens in whatever Subsonic client the user already runs (phone, web, desktop). This server only curates.

## Code layout

```
src/
├── cli.ts                  # argument parser, subcommand dispatch
├── commands/               # serve / init / doctor
├── server/
│   ├── mcp-server.ts       # builds McpServer, registers tools
│   └── transport.ts        # stdio + HTTP transport adapters
├── tools/                  # one file per domain (search, playlist, today, radio, download, now-playing)
├── navidrome/              # thin wrappers over subsonic-api
├── sources/                # SourceProvider interface + youtube.ts (yt-dlp)
├── playlists/              # daily.ts, weekly-radio.ts, scheduler.ts, manager.ts
├── library/                # filename + paths helpers
├── config/                 # zod schema + loader + XDG paths
└── utils/                  # logger (stderr-only — stdout is for JSON-RPC)
```

## Key invariants

1. **Logs go to stderr, never stdout.** In stdio MCP, stdout is reserved for JSON-RPC frames. A stray `console.log` would corrupt the protocol. Tests assert this and `src/utils/logger.ts` is the single allowed sink.

2. **All Subsonic calls go through `getClient(config)`.** That gives us per-process client caching, salt reuse, and a single mock point in tests.

3. **Tool callbacks are thin.** They validate input via zod (the SDK does this for us when we register with `inputSchema`), call into a domain module under `src/playlists/*` or `src/navidrome/*`, and return JSON. No business logic in `src/tools/*`.

4. **`today (YYYY-MM-DD)` is the canonical name.** Any playlist matching that prefix is considered ephemeral. Renaming detaches it. The rollover scheduler deletes only stale ephemeral playlists, never user-named ones.

5. **Download-on-miss is opt-out at the config level (via removing the playlist_add tool), opt-in at the call level (use `playlist_add_tracks` for explicit-ids-only).** The assistant can pick whichever fits the user's intent.

## Data flow: `playlist_add("today", "Holocene Bon Iver")`

1. Tool callback in `src/tools/download.ts` validates input, calls `addByQuery(config, "today", "Holocene Bon Iver")`.
2. `addByQuery` (`src/playlists/manager.ts`) resolves `"today"` to a real playlist via `findPlaylistByName` → which means `formatTodayName()` is auto-computed if the model passed the literal `"today"`.
3. Local-first search: `searchTracks(config, query, 5)`. If a hit exists, `addTracksToPlaylist` and return `added_existing`.
4. On miss: `getProvider(...)` → yt-dlp spawn → mp3 in `library.root/Downloads/`.
5. `triggerScan` + `waitForNewTrack` polls Navidrome until `getScanStatus.count > baseline`.
6. Re-search by title → take top hit → `addTracksToPlaylist`.
7. Return `downloaded_and_added` with the track + the download metadata.

## Scheduler

Croner runs in the same process as the MCP server. Two jobs:

1. **Daily rollover** — fires at `config.playlists.today_rollover_local_time` (default `00:01` local). Lists playlists, deletes any matching `today (YYYY-MM-DD)` where the date is not today.
2. **Weekly radio** — fires at `config.playlists.weekly_radio_cron` (default `0 6 * * 1`). Runs `regenerateWeeklyRadio` which:
   - Fetches `getAlbumList2(type=frequent)`.
   - Scores tracks by `playCount`.
   - Filters out tracks already in the previous 3 weekly radios.
   - Picks top N (default 30) with light jitter.
   - Deletes the existing `Radio Semana <YYYY-Www>` and recreates with the new picks.

The scheduler lifetime matches the server's: started on `serve`, stopped on SIGINT/SIGTERM or stdio close.

## V1.x roadmap

Not in scope for V1, captured here so we don't lose track:

- **More download sources** — Deezer (ARL), Spotify+spotdl, SoundCloud, Bandcamp. Configurable as a priority list for fallback (`sources.fallback_order`).
- **Scrobble-history-driven weekly radio** — SQLite DB synced from a richer Navidrome endpoint (the Subsonic standard `getScrobbles` doesn't exist; we'd lean on Navidrome's `/api/song?_sort=played_at` REST API). Adds skip-weighting and recency to the scoring.
- **Fuzzy query matching** — `playlist_add("today", "ese tema lento de los strokes")` should try permutations.
- **Discover seeding** — 20% of the weekly radio could be releases from the last month that match the user's top genres.
- **Playback control (V2)** — only if someone actually asks. Implementing it cleanly requires Subsonic Jukebox API or MPD bridging; out of scope for the "you control playback in your own app" V1 design.
