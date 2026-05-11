# Configuration

`playlist-curator-mcp` reads its settings from **either** an XDG-style JSON file **or** environment variables (or both — env wins). The cleanest setup is `navidrome-mcp init` which prompts for everything and writes the file with mode `0600`.

## Resolution order

1. `$XDG_CONFIG_HOME/playlist-curator-mcp/config.json` (default: `~/.config/playlist-curator-mcp/config.json`).
2. Environment variables overlay matching fields from the file. So a one-off `NAVIDROME_URL=http://other-host ...` invocation works without editing the file.
3. If neither file nor env vars are present, the server refuses to start with a clear pointer to `navidrome-mcp init`.

## File shape

```jsonc
{
  "navidrome": {
    "url": "http://navidrome.lan:4533",
    "user": "johanyp",
    "password": "..."          // plaintext on disk — set perms 0600 manually if init didn't
  },
  "library": {
    "root": "/srv/music",      // absolute path Navidrome already scans
    "downloads_subdir": "Downloads"
  },
  "sources": {
    "default": "youtube",      // V1: only "youtube"
    "youtube": {
      "audio_quality_kbps": 128,
      "format": "mp3"          // "mp3" | "opus" | "m4a"
    }
  },
  "playlists": {
    "today_rollover_local_time": "00:01",   // HH:MM local
    "weekly_radio_cron": "0 6 * * 1",       // Monday 06:00 local
    "weekly_radio_size": 30
  },
  "history": {
    "scrobble_poll_minutes": 5
  },
  "transport": {
    "http_port": 4098
  },
  "log_level": "info"          // "debug" | "info" | "warn" | "error"
}
```

Most fields have sensible defaults and can be omitted.

## Environment variables (overlay)

| Var | Maps to | Example |
|---|---|---|
| `NAVIDROME_URL` | `navidrome.url` | `http://192.168.1.10:4533` |
| `NAVIDROME_USER` | `navidrome.user` | `johanyp` |
| `NAVIDROME_PASS` | `navidrome.password` | `s3cret` |
| `LIBRARY_ROOT` | `library.root` | `/srv/music` |
| `LOG_LEVEL` | `log_level` | `debug` |
| `YT_DLP_BIN` | (not in config; spawn path override) | `/usr/local/bin/yt-dlp` |

The four "credentials" vars are enough to run the server with all defaults — useful for `npx` invocations from Claude Desktop's `mcpServers` block, where the env hash is the natural place to put them.

## Security notes

- The config file contains your Navidrome password in plaintext. `init` writes with mode `0600` to keep it readable only by your user; if you create the file by hand, run `chmod 600 ~/.config/playlist-curator-mcp/config.json`.
- The HTTP transport listens on `127.0.0.1` by default. Do NOT expose it publicly — the MCP protocol is unauthenticated.
- yt-dlp downloads land in `library.root + downloads_subdir`. Make sure that path is writable by the user running the server.
