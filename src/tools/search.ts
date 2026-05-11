// MCP tools for searching the local library.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Config } from "../config/schema.js";
import { searchTracks } from "../navidrome/search.js";

export function registerSearchTools(server: McpServer, config: Config): void {
  server.registerTool(
    "music_search",
    {
      title: "Search local library",
      description:
        "Search the user's Navidrome library for tracks. Returns the top matches with track id, title, artist, album, duration and year. Use this BEFORE deciding to download anything.",
      inputSchema: {
        query: z
          .string()
          .min(1)
          .describe("Free-text query. Combine title + artist for best ranking, e.g. 'Holocene Bon Iver'."),
        limit: z
          .number()
          .int()
          .positive()
          .max(100)
          .optional()
          .describe("Maximum number of hits to return. Default 25."),
      },
    },
    async ({ query, limit }) => {
      const hits = await searchTracks(config, query, limit ?? 25);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ query, count: hits.length, hits }, null, 2),
          },
        ],
      };
    },
  );
}
