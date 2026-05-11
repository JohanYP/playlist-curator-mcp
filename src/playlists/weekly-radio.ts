// Weekly auto-curated radio.
//
// V1 algorithm (simple, ship-able):
//   1. Ask Navidrome for the top "frequent" albums (Subsonic
//      getAlbumList2 with type=frequent). These are the user's most
//      listened-to albums by Navidrome's own play-count metric.
//   2. Fetch each album's tracks.
//   3. Score every track by playCount and exclude tracks that
//      appeared in the previous 3 weekly radios (anti-repetition).
//   4. Pick the top `weekly_radio_size` (default 30) with a small
//      random jitter so consecutive weeks don't feel identical.
//   5. Replace the playlist named `Radio Semana <YYYY-Www>` with the
//      new selection (delete-then-recreate so the position is fresh).
//
// What we don't have in V1: a per-skip signal, recency weighting,
// genre diversity heuristics. Those land in V1.x once we wire the
// scrobble-history DB.

import type { Config } from "../config/schema.js";
import type SubsonicAPI from "subsonic-api";
import { logger } from "../utils/logger.js";
import { getClient } from "../navidrome/client.js";
import {
  createPlaylist,
  deletePlaylist,
  findPlaylistByName,
  getPlaylist,
  listPlaylists,
  type PlaylistDetail,
  type PlaylistSummary,
} from "../navidrome/playlists.js";

export const RADIO_PREFIX = "Radio Semana ";
const HISTORY_RADIO_WEEKS = 3;
const FREQUENT_ALBUMS_TO_SCAN = 25;

interface ScoredTrack {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  playCount: number;
  score: number;
}

/**
 * Returns "YYYY-Www" for the ISO week of the given date. Mondays start
 * the week, which matches the default cron we ship (`0 6 * * 1`).
 */
export function formatIsoWeek(date: Date = new Date()): string {
  // Cast to UTC and shift so Monday is the week start.
  const tmp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

export function formatWeeklyRadioName(date: Date = new Date()): string {
  return `${RADIO_PREFIX}${formatIsoWeek(date)}`;
}

export async function getWeeklyRadio(config: Config): Promise<PlaylistDetail | null> {
  const summary = await findPlaylistByName(config, formatWeeklyRadioName());
  if (!summary) return null;
  return await getPlaylist(config, summary.id);
}

interface RegenerationResult {
  status: "regenerated" | "no_candidates";
  playlist?: PlaylistSummary;
  trackCount: number;
  /** Sample of the picks for telemetry/debug. */
  topTracks?: Array<{ id: string; title: string; artist?: string; playCount: number }>;
}

export async function regenerateWeeklyRadio(config: Config): Promise<RegenerationResult> {
  const client = getClient(config);
  const targetSize = config.playlists.weekly_radio_size;

  const candidates = await collectFrequentTracks(client);
  if (candidates.length === 0) {
    logger.warn("[radio] no candidates returned by getAlbumList2; skipping regeneration");
    return { status: "no_candidates", trackCount: 0 };
  }

  // Anti-repetition: pull recent weekly radios' track sets and
  // exclude their tracks from this week's picks.
  const recentTrackIds = await collectRecentRadioTrackIds(config, HISTORY_RADIO_WEEKS);
  const fresh = candidates.filter((t) => !recentTrackIds.has(t.id));

  // Fall back to the full candidate set if anti-repetition excluded
  // too many tracks. Better a slightly-repeating radio than an empty one.
  const pool = fresh.length >= Math.min(targetSize, 10) ? fresh : candidates;
  const picks = pickWithJitter(pool, targetSize);

  // Replace strategy: delete the existing playlist (if any) and
  // recreate. updatePlaylist with songIdToAdd appends, and we want a
  // clean slate.
  const name = formatWeeklyRadioName();
  const existing = await findPlaylistByName(config, name);
  if (existing) {
    await deletePlaylist(config, existing.id);
  }
  const fresh_playlist = await createPlaylist(
    config,
    name,
    picks.map((p) => p.id),
  );

  logger.info(`[radio] regenerated ${name} with ${picks.length} tracks`);

  return {
    status: "regenerated",
    playlist: fresh_playlist,
    trackCount: picks.length,
    topTracks: picks.slice(0, 5).map((p) => ({
      id: p.id,
      title: p.title,
      artist: p.artist,
      playCount: p.playCount,
    })),
  };
}

async function collectFrequentTracks(client: SubsonicAPI): Promise<ScoredTrack[]> {
  const albumList = await client.getAlbumList2({
    type: "frequent",
    size: FREQUENT_ALBUMS_TO_SCAN,
  });
  if (albumList.status !== "ok") return [];
  const albums = albumList.albumList2.album ?? [];

  const tracks: ScoredTrack[] = [];
  for (const album of albums) {
    try {
      const detail = await client.getAlbum({ id: album.id });
      if (detail.status !== "ok") continue;
      const songs = detail.album.song ?? [];
      for (const song of songs) {
        const playCount = song.playCount ?? 0;
        if (playCount <= 0) continue;
        tracks.push({
          id: song.id,
          title: song.title,
          artist: song.artist,
          album: song.album,
          playCount,
          score: playCount,
        });
      }
    } catch (err) {
      logger.debug(`[radio] getAlbum(${album.id}) failed`, err);
    }
  }

  // Sort high → low by score.
  tracks.sort((a, b) => b.score - a.score);
  return tracks;
}

async function collectRecentRadioTrackIds(
  config: Config,
  recentWeeks: number,
): Promise<Set<string>> {
  const all = await listPlaylists(config);
  const radios = all
    .filter((p) => p.name.startsWith(RADIO_PREFIX) && p.name !== formatWeeklyRadioName())
    .sort((a, b) => (b.changedAt ?? "").localeCompare(a.changedAt ?? ""))
    .slice(0, recentWeeks);

  const ids = new Set<string>();
  for (const p of radios) {
    const detail = await getPlaylist(config, p.id);
    if (!detail) continue;
    for (const t of detail.tracks) ids.add(t.id);
  }
  return ids;
}

/**
 * Picks the top `n` tracks from `pool`, with a small random jitter so
 * the order varies slightly week-to-week even when the underlying
 * scores are identical. Pool is assumed sorted high→low by score.
 */
function pickWithJitter(pool: ScoredTrack[], n: number): ScoredTrack[] {
  const jittered = pool.map((t) => ({
    ...t,
    jittered: t.score + Math.random() * 0.5,
  }));
  jittered.sort((a, b) => b.jittered - a.jittered);
  return jittered.slice(0, n);
}
