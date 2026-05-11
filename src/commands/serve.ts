// `serve` command — starts the MCP server. Phase 0 is a no-op stub that
// validates config and prints what would happen; Phase 2 wires the real
// McpServer + transports.

import { logger, setLogLevel } from "../utils/logger.js";
import { loadConfig } from "../config/loader.js";

export interface ServeOptions {
  transport: "stdio" | "http";
  httpPort?: number;
  configPath?: string;
}

export async function runServe(options: ServeOptions): Promise<void> {
  const { config, sourcePath } = loadConfig(options.configPath);
  setLogLevel(config.log_level);

  logger.info(`playlist-curator-mcp starting`);
  logger.info(`  config source : ${sourcePath ?? "(env-only)"}`);
  logger.info(`  transport     : ${options.transport}`);
  if (options.transport === "http") {
    logger.info(`  port          : ${options.httpPort ?? config.transport.http_port}`);
  }
  logger.info(`  navidrome     : ${config.navidrome.url} (user=${config.navidrome.user})`);
  logger.info(`  library root  : ${config.library.root}`);
  logger.info(`  weekly cron   : ${config.playlists.weekly_radio_cron}`);

  logger.warn(
    "MCP server not yet implemented (Phase 0 skeleton). Phase 2 wires the McpServer; until then this command only verifies the config loads.",
  );
}
