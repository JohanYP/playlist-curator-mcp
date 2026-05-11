// MCP tools for the ephemeral "today" playlist.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Config } from "../config/schema.js";
import {
  clearToday,
  formatTodayName,
  getToday,
  saveTodayAs,
  purgeStaleTodayPlaylists,
} from "../playlists/daily.js";
import { addByQuery } from "../playlists/manager.js";

function asJson(value: unknown): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  };
}

export function registerTodayTools(server: McpServer, config: Config): void {
  server.registerTool(
    "today_get",
    {
      title: "Today's ephemeral playlist",
      description:
        "Returns the tracks in today's playlist. The playlist is named `today (YYYY-MM-DD)` and is created on demand. At the next rollover it's deleted unless the user has saved it with today_save_as.",
      inputSchema: {},
    },
    async () => {
      // Opportunistic cleanup of stale today playlists in case the
      // server was down at the configured rollover time.
      await purgeStaleTodayPlaylists(config);
      const detail = await getToday(config);
      return asJson(detail);
    },
  );

  server.registerTool(
    "today_add",
    {
      title: "Add a track to today",
      description:
        "Search the library for the query and add the match to today's playlist. If the track isn't in the library, download it via the configured source first (same flow as playlist_add for any playlist).",
      inputSchema: {
        query: z.string().min(1).describe("Free-text query like 'Holocene Bon Iver'."),
        source: z.enum(["youtube"]).optional().describe("Override the default source."),
      },
    },
    async ({ query, source }) => {
      // Make sure today exists before we hand the name off to addByQuery.
      // (addByQuery resolves the playlist by name.)
      await purgeStaleTodayPlaylists(config);
      const todayName = formatTodayName();
      // Reuse the high-level orchestrator so today_add gets local-first
      // search + download-on-miss for free.
      const outcome = await addByQuery(config, todayName, query, { source });
      return asJson(outcome);
    },
  );

  server.registerTool(
    "today_save_as",
    {
      title: "Save today as a permanent playlist",
      description:
        "Renames today's playlist to the given name. After this, today_add creates a fresh today; the saved playlist is no longer subject to the daily rollover.",
      inputSchema: {
        name: z
          .string()
          .min(1)
          .describe("New permanent name, e.g. 'Lluvia Lunes' or 'Workout 2026-05-11'."),
      },
    },
    async ({ name }) => {
      const result = await saveTodayAs(config, name);
      return asJson(result);
    },
  );

  server.registerTool(
    "today_clear",
    {
      title: "Empty today",
      description:
        "Remove every track from today's playlist without deleting the playlist itself. The next today_add starts over.",
      inputSchema: {},
    },
    async () => {
      const result = await clearToday(config);
      return asJson(result);
    },
  );
}
