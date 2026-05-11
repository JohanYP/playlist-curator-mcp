#!/usr/bin/env node
// Entry point for the playlist-curator-mcp CLI.
//
// Layout (Phase 0):
//   playlist-curator-mcp serve [--transport stdio|http] [--port N] [--config PATH]
//   playlist-curator-mcp init
//   playlist-curator-mcp doctor
//   playlist-curator-mcp --version
//   playlist-curator-mcp --help
//
// Default subcommand is `serve` so that Claude Desktop configs like
//   { "command": "npx", "args": ["-y", "playlist-curator-mcp"] }
// just work.

import { runServe } from "./commands/serve.js";
import { runInit } from "./commands/init.js";
import { runDoctor } from "./commands/doctor.js";
import { logger } from "./utils/logger.js";

const VERSION = "0.1.0";

interface ParsedArgs {
  command: "serve" | "init" | "doctor" | "version" | "help";
  serve: {
    transport: "stdio" | "http";
    httpPort?: number;
    configPath?: string;
  };
}

function printHelp(): void {
  process.stderr.write(
    `playlist-curator-mcp v${VERSION}\n\n` +
      `Usage:\n` +
      `  playlist-curator-mcp serve [--transport stdio|http] [--port N] [--config PATH]\n` +
      `  playlist-curator-mcp init\n` +
      `  playlist-curator-mcp doctor\n` +
      `  playlist-curator-mcp --version\n` +
      `  playlist-curator-mcp --help\n\n` +
      `If no subcommand is given, \`serve --transport stdio\` is assumed.\n\n` +
      `Env vars (override config.json):\n` +
      `  NAVIDROME_URL, NAVIDROME_USER, NAVIDROME_PASS\n` +
      `  LIBRARY_ROOT\n` +
      `  LOG_LEVEL = debug | info | warn | error\n`,
  );
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    command: "serve",
    serve: { transport: "stdio" },
  };

  const args = [...argv];

  // Top-level flags
  if (args.includes("--help") || args.includes("-h")) {
    parsed.command = "help";
    return parsed;
  }
  if (args.includes("--version") || args.includes("-v")) {
    parsed.command = "version";
    return parsed;
  }

  // Subcommand (default: serve)
  const sub = args[0];
  if (sub === "init") {
    parsed.command = "init";
    return parsed;
  }
  if (sub === "doctor") {
    parsed.command = "doctor";
    return parsed;
  }
  if (sub === "serve") {
    args.shift();
  }

  // serve options
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === "--transport") {
      const v = args[++i];
      if (v !== "stdio" && v !== "http") {
        throw new Error(`--transport must be 'stdio' or 'http' (got ${v ?? "<nothing>"})`);
      }
      parsed.serve.transport = v;
    } else if (a === "--port") {
      const n = Number.parseInt(args[++i] ?? "", 10);
      if (!Number.isInteger(n) || n < 1 || n > 65535) {
        throw new Error("--port must be an integer 1..65535");
      }
      parsed.serve.httpPort = n;
    } else if (a === "--config") {
      parsed.serve.configPath = args[++i];
    } else if (a?.startsWith("--")) {
      throw new Error(`Unknown flag: ${a}`);
    }
  }

  return parsed;
}

async function main(): Promise<void> {
  let parsed: ParsedArgs;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (err) {
    logger.error(err instanceof Error ? err.message : String(err));
    printHelp();
    process.exit(2);
  }

  switch (parsed.command) {
    case "help":
      printHelp();
      return;
    case "version":
      process.stdout.write(`${VERSION}\n`);
      return;
    case "init":
      await runInit();
      return;
    case "doctor": {
      const code = await runDoctor();
      process.exit(code);
      return;
    }
    case "serve":
      await runServe(parsed.serve);
      return;
  }
}

main().catch((err) => {
  logger.error("Fatal error", err);
  process.exit(1);
});
