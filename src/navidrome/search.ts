// Local-library search via the Subsonic search3 endpoint.
//
// We expose a single `searchTracks` that returns up to `limit` song hits
// (most relevant first per Navidrome's ranking) and drop the album /
// artist groups from the surface — the curator workflows only care
// about specific tracks. If we ever need album-level pickers we'll
// add a `searchAlbums` alongside.

import type { Config } from "../config/schema.js";
import { getClient } from "./client.js";

export interface TrackHit {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  duration?: number;
  /** Year, when Navidrome has tagged it. Useful tiebreaker for the model. */
  year?: number;
}

export async function searchTracks(
  config: Config,
  query: string,
  limit: number = 25,
): Promise<TrackHit[]> {
  if (!query.trim()) return [];

  const result = await getClient(config).search3({
    query,
    songCount: limit,
    // Navidrome ignores zero values; passing the explicit 0 ensures we
    // don't waste roundtrips fetching albums/artists we throw away.
    artistCount: 0,
    albumCount: 0,
  });

  if (result.status !== "ok") return [];
  const songs = result.searchResult3?.song ?? [];
  return songs.map((s) => ({
    id: s.id,
    title: s.title,
    artist: s.artist,
    album: s.album,
    duration: s.duration,
    year: s.year,
  }));
}
