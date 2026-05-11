// "today" ephemeral playlist lifecycle.
//
// Naming convention: `today (YYYY-MM-DD)` — that lets multiple days
// coexist briefly (during the rollover) without name collisions, and
// makes the playlist self-describing in any Navidrome client.
//
// Lifecycle:
//   - first today_add of the day -> create `today (YYYY-MM-DD)` if not
//     already there.
//   - today_save_as(name) -> rename it; that detaches it from the
//     ephemeral pool, so the next today_add starts a fresh one.
//   - rollover (daily, via scheduler) -> delete yesterday's today if
//     it wasn't saved. We never touch playlists whose name doesn't
//     match the today-prefix, so user-renamed (saved) playlists are
//     safe.

import type { Config } from "../config/schema.js";
import { logger } from "../utils/logger.js";
import {
  createPlaylist,
  deletePlaylist,
  findPlaylistByName,
  getPlaylist,
  listPlaylists,
  removeTracksFromPlaylist,
  renamePlaylist,
  type PlaylistDetail,
  type PlaylistSummary,
} from "../navidrome/playlists.js";

export const TODAY_PREFIX = "today (";

export function formatTodayName(date: Date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `today (${yyyy}-${mm}-${dd})`;
}

export function isTodayName(name: string): boolean {
  return name.startsWith(TODAY_PREFIX) && name.endsWith(")");
}

/**
 * Get-or-create today's playlist. Returns the playlist summary either way.
 */
export async function getOrCreateToday(config: Config): Promise<PlaylistSummary> {
  const name = formatTodayName();
  const existing = await findPlaylistByName(config, name);
  if (existing) return existing;

  logger.info(`[today] creating playlist ${name}`);
  return await createPlaylist(config, name, []);
}

/**
 * Returns the current today playlist with its tracks. Creates the
 * playlist on the fly if there's nothing for today yet (callers like
 * `today_get` tool want a consistent shape regardless).
 */
export async function getToday(config: Config): Promise<PlaylistDetail> {
  const summary = await getOrCreateToday(config);
  const detail = await getPlaylist(config, summary.id);
  if (!detail) {
    // Race: somebody deleted it between create and fetch. Recreate.
    const fresh = await getOrCreateToday(config);
    return { ...fresh, tracks: [] };
  }
  return detail;
}

/**
 * Promote today's playlist to a permanent one by renaming it. After
 * this, today_add creates a fresh today.
 */
export async function saveTodayAs(
  config: Config,
  newName: string,
): Promise<{ savedAs: string; playlistId: string }> {
  const today = await findPlaylistByName(config, formatTodayName());
  if (!today) {
    throw new Error(
      `No today playlist exists yet — add something with today_add before saving.`,
    );
  }
  if (await findPlaylistByName(config, newName)) {
    throw new Error(`A playlist already exists with name "${newName}". Pick a different name.`);
  }
  await renamePlaylist(config, today.id, newName);
  logger.info(`[today] saved today (${today.id}) as "${newName}"`);
  return { savedAs: newName, playlistId: today.id };
}

/**
 * Empty today's playlist without deleting it.
 */
export async function clearToday(config: Config): Promise<{ removed: number }> {
  const today = await findPlaylistByName(config, formatTodayName());
  if (!today) return { removed: 0 };
  const detail = await getPlaylist(config, today.id);
  if (!detail || detail.tracks.length === 0) return { removed: 0 };

  const positions = detail.tracks.map((_t, idx) => idx);
  await removeTracksFromPlaylist(config, today.id, positions);
  return { removed: positions.length };
}

/**
 * Find and delete any `today (...)` playlists whose date is older than
 * today. Called by the scheduler at the configured rollover time, and
 * also opportunistically on first today_add to clean up stale state if
 * the server was down at midnight.
 */
export async function purgeStaleTodayPlaylists(config: Config): Promise<{ deleted: string[] }> {
  const todays = formatTodayName();
  const all = await listPlaylists(config);
  const stale = all.filter((p) => isTodayName(p.name) && p.name !== todays);
  const deleted: string[] = [];
  for (const p of stale) {
    try {
      await deletePlaylist(config, p.id);
      deleted.push(p.name);
      logger.info(`[today] purged stale playlist ${p.name} (id ${p.id})`);
    } catch (err) {
      logger.warn(`[today] failed to delete stale ${p.name}`, err);
    }
  }
  return { deleted };
}
