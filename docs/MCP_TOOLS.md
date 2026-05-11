# MCP Tools

The server registers 16 tools across 5 domains. Names are `snake_case` to match the convention used by most MCP servers in the ecosystem. Every tool returns its result as a single `text` content block containing JSON.

## Search

### `music_search(query, limit?)`
Search the Navidrome library.

**Inputs**
- `query` (string, required) — free-text. Combine title + artist for best ranking: `"Holocene Bon Iver"`.
- `limit` (int, optional, default 25, max 100) — number of hits to return.

**Returns** `{ query, count, hits: [{ id, title, artist, album, duration, year }] }`

---

## Playlists (general)

### `playlist_list()`
Enumerate all playlists with id, name, songCount, duration.

### `playlist_get(name)`
Full playlist detail including tracks. `name` accepts either an exact name (case-insensitive fallback) or a Subsonic playlist id.

### `playlist_create(name)`
Create an empty playlist. Refuses to create if a playlist with the same name already exists (returns the existing id so the model can decide what to do).

### `playlist_rename(from, to)`
Rename. `from` accepts name or id; `to` is the new name.

### `playlist_delete(name)`
Delete permanently. Cannot be undone.

### `playlist_add(playlist, query, source?)`
**The canonical conversational entry point.** Search the library for the query. If a match exists, add it. If not, download via the configured source (V1: `youtube` via yt-dlp), wait for Navidrome to index the new file, then add. Returns one of:

- `{ status: "added_existing", playlistId, playlistName, track }`
- `{ status: "downloaded_and_added", playlistId, playlistName, track, download: { filePath, sourceUrl, title, ... } }`
- `{ status: "downloaded_but_not_indexed", playlistId, playlistName, download, message }`
- `{ status: "playlist_not_found", playlist }`

### `playlist_add_tracks(playlist, track_ids)`
Low-level: append known track ids. Use this when the model already has ids from `music_search` and wants to skip the high-level flow.

### `playlist_remove_tracks(playlist, positions)`
Remove tracks by their zero-based positions in the playlist. Use `playlist_get` to inspect positions first.

---

## Today's ephemeral playlist

### `today_get()`
Returns the tracks in `today (YYYY-MM-DD)`. Creates the playlist on demand.

### `today_add(query, source?)`
Add to today using the same `playlist_add` flow (local-first + download-on-miss). Same return shapes as `playlist_add`.

### `today_save_as(name)`
Promote today's playlist to permanent by renaming it. After this, the next `today_add` starts a fresh today. Refuses if `name` collides with an existing playlist.

### `today_clear()`
Empty today's playlist without deleting it.

---

## Weekly auto-curated radio

### `weekly_radio_get()`
Return `Radio Semana <YYYY-Www>` for the current ISO week, or an error message if it hasn't been generated yet.

### `weekly_radio_regenerate()`
Force regenerate. The scheduler runs this automatically on the configured cron (default: Monday 06:00 local), so this tool is for manual triggers.

The V1 algorithm:
1. `getAlbumList2(type=frequent)` for Navidrome's own ranking of most-played albums.
2. Fetch each album, score tracks by `playCount`.
3. Exclude tracks already in the previous 3 weekly radios (anti-repetition).
4. Pick top N (default 30) with light random jitter so consecutive weeks aren't identical.
5. Delete-and-recreate the current week's `Radio Semana ...` playlist.

V1.x will swap in a scrobble-history-driven scoring once we wire that DB.

---

## Downloads

### `music_download(query | url, source?)`
Raw download without adding to any playlist. Used when the user wants the file in their library but no playlist yet. Returns `{ status, source, download: {...}, scanIndexed }`.

Available sources: `youtube` (V1). V1.x will add Deezer, Spotify+spotdl, etc.

---

## Status

### `status_now_playing()`
What's currently playing on any Subsonic client connected to Navidrome — useful for the model to say "you're listening to X right now" or to suggest songs that match the current mood. **Read-only**: this server does NOT control playback (no play/pause/skip).

Returns `{ entries: [{ user, client, trackId, title, artist, album, minutesAgo }] }`.

---

## Example conversations

**Curating today:**
> *"add Holocene by Bon Iver to today"* → `today_add("Holocene Bon Iver")` →
> `{ status: "downloaded_and_added", track: { title: "Holocene", ... } }`

**Saving the routine:**
> *"keep today's playlist as 'rainy monday vol 2'"* → `today_save_as("rainy monday vol 2")` →
> `{ savedAs: "rainy monday vol 2", playlistId: "abc" }`

**Checking weekly radio:**
> *"what's the radio for this week?"* → `weekly_radio_get()` → returns the 30 tracks.

**Diagnostics:**
> *"what am I listening to right now?"* → `status_now_playing()` →
> `{ entries: [{ user: "johanyp", title: "Holocene", client: "Symfonium", minutesAgo: 2 }] }`
