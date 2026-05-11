// Read-only playback observation tools.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config/schema.js";
import { getNowPlaying } from "../navidrome/now-playing.js";

export function registerNowPlayingTools(server: McpServer, config: Config): void {
  server.registerTool(
    "status_now_playing",
    {
      title: "Now playing across clients",
      description:
        "Show what's currently playing on any Subsonic client connected to this Navidrome (Symfonium, DSub, Navidrome web, etc.). The MCP does NOT control playback — it only reports.",
      inputSchema: {},
    },
    async () => {
      const entries = await getNowPlaying(config);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ entries }, null, 2),
          },
        ],
      };
    },
  );
}
