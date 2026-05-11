// Constructs the McpServer and registers all tools for the curator.
// Tools are split across files by domain so each file is small and the
// tool registry stays scannable.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config/schema.js";
import { registerSearchTools } from "../tools/search.js";
import { registerPlaylistTools } from "../tools/playlist.js";
import { registerNowPlayingTools } from "../tools/now-playing.js";

export interface ServerInfo {
  name: string;
  version: string;
}

export function buildServer(info: ServerInfo, config: Config): McpServer {
  const server = new McpServer({
    name: info.name,
    version: info.version,
  });

  // Each domain registers its tools onto the same server instance.
  // Tools added later in this list show up later in `tools/list` — the
  // model usually doesn't care about order, but keeping search first
  // and CRUD second mirrors the typical mental model.
  registerSearchTools(server, config);
  registerPlaylistTools(server, config);
  registerNowPlayingTools(server, config);

  return server;
}
