// Playlist CRUD tools. Phase 2 covers the simple operations against
// existing tracks (search for the user's library and add by id).
// Phase 3 will add `playlist_add(query)` with local-first download.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Config } from "../config/schema.js";
import {
  addTracksToPlaylist,
  createPlaylist,
  deletePlaylist,
  findPlaylistByName,
  getPlaylist,
  listPlaylists,
  removeTracksFromPlaylist,
  renamePlaylist,
} from "../navidrome/playlists.js";

function asJson(value: unknown): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  };
}

async function resolvePlaylist(
  config: Config,
  identifier: string,
): Promise<{ id: string; name: string } | null> {
  // Accept either a playlist ID (Subsonic IDs are short hex/alnum
  // strings; if it matches an existing playlist by id, prefer that)
  // or a playlist name. Name match is exact-first, case-insensitive
  // fallback (see playlists.ts).
  const byName = await findPlaylistByName(config, identifier);
  if (byName) return { id: byName.id, name: byName.name };
  // Fallback: maybe `identifier` is already the id. We could call
  // getPlaylist to confirm but a missing id just returns null below,
  // which the tool surface translates to a helpful error.
  const detail = await getPlaylist(config, identifier).catch(() => null);
  if (detail) return { id: detail.id, name: detail.name };
  return null;
}

export function registerPlaylistTools(server: McpServer, config: Config): void {
  server.registerTool(
    "playlist_list",
    {
      title: "List playlists",
      description: "List all playlists in Navidrome with id, name, song count and duration.",
      inputSchema: {},
    },
    async () => asJson({ playlists: await listPlaylists(config) }),
  );

  server.registerTool(
    "playlist_get",
    {
      title: "Get playlist tracks",
      description: "Get a playlist by name (or id) including its tracks.",
      inputSchema: {
        name: z.string().min(1).describe("Playlist name (exact, case-insensitive fallback) or id."),
      },
    },
    async ({ name }) => {
      const ref = await resolvePlaylist(config, name);
      if (!ref) return asJson({ error: `playlist not found: ${name}` });
      const detail = await getPlaylist(config, ref.id);
      return asJson(detail ?? { error: `playlist disappeared between resolve and fetch: ${ref.id}` });
    },
  );

  server.registerTool(
    "playlist_create",
    {
      title: "Create empty playlist",
      description: "Create a new empty playlist. Fails if a playlist with the same name already exists.",
      inputSchema: {
        name: z.string().min(1).describe("Name of the new playlist."),
      },
    },
    async ({ name }) => {
      const existing = await findPlaylistByName(config, name);
      if (existing) return asJson({ error: `playlist already exists: ${name}`, existingId: existing.id });
      const created = await createPlaylist(config, name, []);
      return asJson({ created });
    },
  );

  server.registerTool(
    "playlist_rename",
    {
      title: "Rename playlist",
      description: "Rename an existing playlist.",
      inputSchema: {
        from: z.string().min(1).describe("Current playlist name or id."),
        to: z.string().min(1).describe("New name."),
      },
    },
    async ({ from, to }) => {
      const ref = await resolvePlaylist(config, from);
      if (!ref) return asJson({ error: `playlist not found: ${from}` });
      await renamePlaylist(config, ref.id, to);
      return asJson({ renamed: { id: ref.id, oldName: ref.name, newName: to } });
    },
  );

  server.registerTool(
    "playlist_delete",
    {
      title: "Delete playlist",
      description: "Delete a playlist permanently. Cannot be undone.",
      inputSchema: {
        name: z.string().min(1).describe("Playlist name or id."),
      },
    },
    async ({ name }) => {
      const ref = await resolvePlaylist(config, name);
      if (!ref) return asJson({ error: `playlist not found: ${name}` });
      await deletePlaylist(config, ref.id);
      return asJson({ deleted: ref });
    },
  );

  server.registerTool(
    "playlist_add_tracks",
    {
      title: "Add already-known tracks to a playlist",
      description:
        "Append one or more existing track ids (from music_search) to a playlist. This is the low-level operation. " +
        "Phase 3 will add `playlist_add` that takes a query and handles search + download-on-miss automatically.",
      inputSchema: {
        playlist: z.string().min(1).describe("Playlist name or id."),
        track_ids: z.array(z.string().min(1)).min(1).describe("Track ids returned by music_search."),
      },
    },
    async ({ playlist, track_ids }) => {
      const ref = await resolvePlaylist(config, playlist);
      if (!ref) return asJson({ error: `playlist not found: ${playlist}` });
      await addTracksToPlaylist(config, ref.id, track_ids);
      return asJson({ added: { playlist: ref, count: track_ids.length } });
    },
  );

  server.registerTool(
    "playlist_remove_tracks",
    {
      title: "Remove tracks from a playlist by position",
      description:
        "Remove tracks from a playlist using their zero-based positions. Use playlist_get to inspect positions first.",
      inputSchema: {
        playlist: z.string().min(1).describe("Playlist name or id."),
        positions: z.array(z.number().int().nonnegative()).min(1),
      },
    },
    async ({ playlist, positions }) => {
      const ref = await resolvePlaylist(config, playlist);
      if (!ref) return asJson({ error: `playlist not found: ${playlist}` });
      await removeTracksFromPlaylist(config, ref.id, positions);
      return asJson({ removed: { playlist: ref, count: positions.length } });
    },
  );
}
