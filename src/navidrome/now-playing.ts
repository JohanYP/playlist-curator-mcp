// Read-only playback observation. The MCP server doesn't control
// transports (the user listens through Symfonium / Navidrome web /
// whatever) — but it CAN see what's currently playing across all
// connected clients via the Subsonic `getNowPlaying` endpoint.

import type { Config } from "../config/schema.js";
import { getClient } from "./client.js";

export interface NowPlayingEntry {
  user: string;
  client?: string;
  trackId: string;
  title: string;
  artist?: string;
  album?: string;
  /** Seconds since the user started playing. Navidrome reports this. */
  minutesAgo?: number;
}

export async function getNowPlaying(config: Config): Promise<NowPlayingEntry[]> {
  const result = await getClient(config).getNowPlaying();
  if (result.status !== "ok") return [];
  const raw = result.nowPlaying?.entry ?? [];
  return raw.map((e) => ({
    user: e.username,
    client: e.playerName,
    trackId: e.id,
    title: e.title,
    artist: e.artist,
    album: e.album,
    minutesAgo: e.minutesAgo,
  }));
}
