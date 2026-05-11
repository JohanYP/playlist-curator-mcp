// MCP tools for the weekly auto-curated radio.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config/schema.js";
import { getWeeklyRadio, regenerateWeeklyRadio } from "../playlists/weekly-radio.js";

function asJson(value: unknown): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  };
}

export function registerRadioTools(server: McpServer, config: Config): void {
  server.registerTool(
    "weekly_radio_get",
    {
      title: "Get this week's auto-curated radio",
      description:
        "Returns the playlist named `Radio Semana <YYYY-Www>` for the current ISO week. Null if it hasn't been generated yet (call weekly_radio_regenerate or wait for the Monday cron).",
      inputSchema: {},
    },
    async () => {
      const playlist = await getWeeklyRadio(config);
      return asJson(playlist ?? { error: "no weekly radio yet for this week" });
    },
  );

  server.registerTool(
    "weekly_radio_regenerate",
    {
      title: "Force regenerate this week's radio",
      description:
        "Rebuilds the `Radio Semana <YYYY-Www>` playlist by scanning Navidrome's most-played albums, scoring tracks, applying anti-repetition against the previous 3 weeks, and replacing the playlist. Normally fires automatically on the configured weekly cron — this is the manual trigger.",
      inputSchema: {},
    },
    async () => {
      const result = await regenerateWeeklyRadio(config);
      return asJson(result);
    },
  );
}
