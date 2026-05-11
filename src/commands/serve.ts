// `serve` command — boots the MCP server with the requested transport.

import { logger, setLogLevel } from "../utils/logger.js";
import { loadConfig } from "../config/loader.js";
import { buildServer } from "../server/mcp-server.js";
import { runHttp, runStdio } from "../server/transport.js";
import { startScheduler } from "../playlists/scheduler.js";

const SERVER_NAME = "playlist-curator-mcp";
const SERVER_VERSION = "0.1.0";

export interface ServeOptions {
  transport: "stdio" | "http";
  httpPort?: number;
  configPath?: string;
}

export async function runServe(options: ServeOptions): Promise<void> {
  const { config, sourcePath } = loadConfig(options.configPath);
  setLogLevel(config.log_level);

  // We log to stderr, so it's fine even on stdio transport — Claude
  // Desktop and friends only parse stdout.
  logger.info(`${SERVER_NAME} v${SERVER_VERSION}`);
  logger.info(`  config source : ${sourcePath ?? "(env-only)"}`);
  logger.info(`  transport     : ${options.transport}`);
  logger.info(`  navidrome     : ${config.navidrome.url} (user=${config.navidrome.user})`);
  logger.info(`  library root  : ${config.library.root}`);

  const server = buildServer({ name: SERVER_NAME, version: SERVER_VERSION }, config);

  // Background jobs (daily rollover, weekly radio). The weekly tick is
  // a no-op until Phase 5 wires the regenerator.
  const scheduler = startScheduler(config);

  if (options.transport === "http") {
    const port = options.httpPort ?? config.transport.http_port;
    const handle = await runHttp(server, { port });
    logger.info(`  listening on  : ${handle.url}`);

    // Stay alive until SIGINT/SIGTERM. We also stop the transport
    // cleanly so half-finished SSE streams flush before exit.
    const shutdown = async (signal: string): Promise<void> => {
      logger.info(`Received ${signal}, shutting down...`);
      scheduler.stop();
      await handle.close().catch((err) => logger.warn("close() failed", err));
      process.exit(0);
    };
    process.on("SIGINT", () => void shutdown("SIGINT"));
    process.on("SIGTERM", () => void shutdown("SIGTERM"));
    // Keep the event loop alive indefinitely.
    await new Promise<void>(() => undefined);
    return;
  }

  // Stdio: the transport ends when the client disconnects (Claude
  // Desktop closes the subprocess on quit). We exit cleanly when that
  // happens so the parent process doesn't see a hung child.
  const { done } = await runStdio(server);
  await done;
  scheduler.stop();
  logger.info("Stdio client disconnected, exiting.");
}
