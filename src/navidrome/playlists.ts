// Wrappers around Subsonic playlist endpoints. Each function returns
// the slim shape our tools actually consume — the raw subsonic-api
// types are verbose and we don't want them to leak into the MCP
// surface (we shouldn't return openSubsonic/version flags etc.).

import type { Config } from "../config/schema.js";
import { getClient } from "./client.js";

export interface PlaylistSummary {
  id: string;
  name: string;
  songCount: number;
  duration: number;
  comment?: string;
  /** ISO 8601. Useful for "is this the today playlist for today's date?" checks. */
  createdAt?: string;
  /** ISO 8601. */
  changedAt?: string;
}

export interface PlaylistTrack {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  duration?: number;
}

export interface PlaylistDetail extends PlaylistSummary {
  tracks: PlaylistTrack[];
}

export async function listPlaylists(config: Config): Promise<PlaylistSummary[]> {
  const result = await getClient(config).getPlaylists();
  if (result.status !== "ok") return [];
  const raw = result.playlists?.playlist ?? [];
  return raw.map(toSummary);
}

export async function getPlaylist(
  config: Config,
  id: string,
): Promise<PlaylistDetail | null> {
  const result = await getClient(config).getPlaylist({ id });
  if (result.status !== "ok") return null;
  const p = result.playlist;
  const summary = toSummary(p);
  const tracks = (p.entry ?? []).map(toTrack);
  return { ...summary, tracks };
}

export async function findPlaylistByName(
  config: Config,
  name: string,
): Promise<PlaylistSummary | null> {
  const all = await listPlaylists(config);
  // Exact match first; case-insensitive fallback. We never want a partial
  // substring match here — that would break the "today" rollover that
  // relies on detecting "today (YYYY-MM-DD)" exactly.
  return (
    all.find((p) => p.name === name) ??
    all.find((p) => p.name.toLowerCase() === name.toLowerCase()) ??
    null
  );
}

export async function createPlaylist(
  config: Config,
  name: string,
  initialSongIds: string[] = [],
): Promise<PlaylistSummary> {
  const result = await getClient(config).createPlaylist({
    name,
    songId: initialSongIds.length > 0 ? initialSongIds : undefined,
  });
  if (result.status !== "ok") {
    throw new Error(
      `createPlaylist(${name}) failed: ${result.status === "failed" ? result.error.message ?? result.error.code : "unknown"}`,
    );
  }
  return toSummary(result.playlist);
}

export async function renamePlaylist(
  config: Config,
  id: string,
  newName: string,
): Promise<void> {
  const result = await getClient(config).updatePlaylist({
    playlistId: id,
    name: newName,
  });
  if (result.status !== "ok") {
    throw new Error(
      `renamePlaylist(${id} -> ${newName}) failed: ${result.status === "failed" ? result.error.message ?? result.error.code : "unknown"}`,
    );
  }
}

export async function addTracksToPlaylist(
  config: Config,
  id: string,
  trackIds: string[],
): Promise<void> {
  if (trackIds.length === 0) return;
  const result = await getClient(config).updatePlaylist({
    playlistId: id,
    songIdToAdd: trackIds,
  });
  if (result.status !== "ok") {
    throw new Error(
      `addTracksToPlaylist(${id}) failed: ${result.status === "failed" ? result.error.message ?? result.error.code : "unknown"}`,
    );
  }
}

export async function removeTracksFromPlaylist(
  config: Config,
  id: string,
  indices: number[],
): Promise<void> {
  if (indices.length === 0) return;
  const result = await getClient(config).updatePlaylist({
    playlistId: id,
    songIndexToRemove: indices,
  });
  if (result.status !== "ok") {
    throw new Error(
      `removeTracksFromPlaylist(${id}) failed: ${result.status === "failed" ? result.error.message ?? result.error.code : "unknown"}`,
    );
  }
}

export async function deletePlaylist(config: Config, id: string): Promise<void> {
  const result = await getClient(config).deletePlaylist({ id });
  if (result.status !== "ok") {
    throw new Error(
      `deletePlaylist(${id}) failed: ${result.status === "failed" ? result.error.message ?? result.error.code : "unknown"}`,
    );
  }
}

interface RawPlaylist {
  id: string;
  name: string;
  songCount?: number;
  duration?: number;
  comment?: string;
  // subsonic-api types `created` / `changed` as `string | Date` — its
  // parser doesn't normalize the OpenSubsonic ISO timestamps. We accept
  // both shapes here and stringify on the way out so our public surface
  // is always ISO-8601 plain strings.
  created?: string | Date;
  changed?: string | Date;
  entry?: Array<{
    id: string;
    title: string;
    artist?: string;
    album?: string;
    duration?: number;
  }>;
}

function toIso(value: string | Date | undefined): string | undefined {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : value;
}

function toSummary(p: RawPlaylist): PlaylistSummary {
  return {
    id: p.id,
    name: p.name,
    songCount: p.songCount ?? 0,
    duration: p.duration ?? 0,
    comment: p.comment,
    createdAt: toIso(p.created),
    changedAt: toIso(p.changed),
  };
}

function toTrack(e: {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  duration?: number;
}): PlaylistTrack {
  return {
    id: e.id,
    title: e.title,
    artist: e.artist,
    album: e.album,
    duration: e.duration,
  };
}
