// High-level orchestration: given a free-text query, find the track
// locally (Navidrome search), and if it's not there, download it via
// the configured source and wait for Navidrome to index it. Then add
// the track to the requested playlist.
//
// This is the function the model calls when the user says "add
// Holocene by Bon Iver to my playlist of today". The point of this
// module is to keep the "search vs download" plumbing OUT of the tool
// layer so the tool callback stays a one-liner.

import type { Config } from "../config/schema.js";
import { logger } from "../utils/logger.js";
import { addTracksToPlaylist, findPlaylistByName, getPlaylist } from "../navidrome/playlists.js";
import { searchTracks, type TrackHit } from "../navidrome/search.js";
import { getScanStatus, waitForNewTrack } from "../navidrome/library-rescan.js";
import { getProvider } from "../sources/registry.js";
import type { DownloadResult } from "../sources/types.js";

export type AddOutcome =
  | {
      status: "added_existing";
      playlistId: string;
      playlistName: string;
      track: TrackHit;
    }
  | {
      status: "downloaded_and_added";
      playlistId: string;
      playlistName: string;
      track: TrackHit;
      download: DownloadResult;
    }
  | {
      status: "downloaded_but_not_indexed";
      playlistId: string;
      playlistName: string;
      download: DownloadResult;
      message: string;
    }
  | {
      status: "playlist_not_found";
      playlist: string;
    };

export interface AddOptions {
  /** Override the default source for this call. */
  source?: string;
  /** Maximum time we wait for Navidrome to index a freshly-downloaded file. */
  scanTimeoutMs?: number;
}

export async function addByQuery(
  config: Config,
  playlistRef: string,
  query: string,
  options: AddOptions = {},
): Promise<AddOutcome> {
  const playlist = await findPlaylistByName(config, playlistRef);
  if (!playlist) {
    return { status: "playlist_not_found", playlist: playlistRef };
  }

  // 1. Local first — does Navidrome already have it?
  const localHits = await searchTracks(config, query, 5);
  if (localHits.length > 0) {
    const top = localHits[0];
    if (top) {
      await addTracksToPlaylist(config, playlist.id, [top.id]);
      logger.info(
        `[manager] added existing track ${top.id} (${top.title}) to playlist ${playlist.name}`,
      );
      return {
        status: "added_existing",
        playlistId: playlist.id,
        playlistName: playlist.name,
        track: top,
      };
    }
  }

  // 2. Miss — download via the configured provider.
  logger.info(`[manager] miss for "${query}", downloading via ${options.source ?? "default source"}`);
  const provider = getProvider(options.source, config);
  const baseline = await getScanStatus(config);
  const downloaded = await provider.download(query, config);

  // 3. Wait for Navidrome to index the new file.
  const indexed = await waitForNewTrack(config, {
    baselineCount: baseline.count,
    timeoutMs: options.scanTimeoutMs ?? 60_000,
  });

  // 4. Re-search to discover the new track id. Some Navidrome versions
  // include the artist in the title, some don't — we try the title
  // alone first (most reliable) and fall back to the original query.
  const candidates = await tryFindTrack(config, downloaded.title, query);
  if (!indexed || candidates.length === 0) {
    return {
      status: "downloaded_but_not_indexed",
      playlistId: playlist.id,
      playlistName: playlist.name,
      download: downloaded,
      message:
        `Track downloaded to ${downloaded.filePath} but Navidrome had not indexed it within the scan timeout. ` +
        `Re-run the same command in a few seconds, or trigger a rescan manually.`,
    };
  }

  const newTrack = candidates[0];
  if (!newTrack) {
    return {
      status: "downloaded_but_not_indexed",
      playlistId: playlist.id,
      playlistName: playlist.name,
      download: downloaded,
      message: "Track indexed but matching record could not be confirmed.",
    };
  }
  await addTracksToPlaylist(config, playlist.id, [newTrack.id]);
  logger.info(
    `[manager] downloaded + added ${newTrack.id} (${newTrack.title}) to playlist ${playlist.name}`,
  );
  return {
    status: "downloaded_and_added",
    playlistId: playlist.id,
    playlistName: playlist.name,
    track: newTrack,
    download: downloaded,
  };
}

async function tryFindTrack(config: Config, primary: string, fallback: string): Promise<TrackHit[]> {
  const hits = await searchTracks(config, primary, 5);
  if (hits.length > 0) return hits;
  return await searchTracks(config, fallback, 5);
}

// Exposed for tools that just want the playlist details after an add.
export async function getPlaylistDetail(config: Config, playlistId: string) {
  return await getPlaylist(config, playlistId);
}
