// Download tools. `music_download` is the raw download (without adding
// to any playlist). `playlist_add` is the high-level user-facing flow
// that does local-first search + download-on-miss + add to playlist.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Config } from "../config/schema.js";
import { addByQuery } from "../playlists/manager.js";
import { getProvider, listProviders } from "../sources/registry.js";
import { waitForNewTrack, getScanStatus } from "../navidrome/library-rescan.js";

function asJson(value: unknown): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  };
}

export function registerDownloadTools(server: McpServer, config: Config): void {
  server.registerTool(
    "music_download",
    {
      title: "Download a track from an external source",
      description:
        "Download a track without adding it to any playlist. Use this when the user explicitly wants the file in their library but no playlist yet. " +
        "Returns the path the file landed at and the source URL. " +
        "Available sources: " +
        listProviders().join(", "),
      inputSchema: {
        query: z
          .string()
          .min(1)
          .describe("Either a free-text query like 'Holocene Bon Iver' or a direct URL of the source."),
        source: z
          .enum(["youtube"])
          .optional()
          .describe("Override the default download source. Defaults to config.sources.default."),
      },
    },
    async ({ query, source }) => {
      const provider = getProvider(source, config);
      const baseline = await getScanStatus(config);
      const downloaded = await provider.download(query, config);
      const indexed = await waitForNewTrack(config, {
        baselineCount: baseline.count,
        timeoutMs: 60_000,
      });
      return asJson({
        status: indexed ? "downloaded_and_indexed" : "downloaded_pending_index",
        source: provider.name,
        download: downloaded,
        scanIndexed: indexed,
      });
    },
  );

  server.registerTool(
    "playlist_add",
    {
      title: "Add a track to a playlist by query (with auto-download)",
      description:
        "Search the local library for the query. If a match exists, add it to the playlist. " +
        "If not, download it via the configured source and wait for Navidrome to index it, then add. " +
        "This is the canonical way to grow a playlist conversationally — the model just hands a free-text query.",
      inputSchema: {
        playlist: z.string().min(1).describe("Playlist name or id."),
        query: z.string().min(1).describe("Free-text query like 'Holocene Bon Iver'."),
        source: z
          .enum(["youtube"])
          .optional()
          .describe("Override the default download source for this call."),
      },
    },
    async ({ playlist, query, source }) => {
      const outcome = await addByQuery(config, playlist, query, { source });
      return asJson(outcome);
    },
  );
}
