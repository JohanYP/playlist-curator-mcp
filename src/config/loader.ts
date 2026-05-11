// Loads the runtime config. Resolution order:
//   1. Read $XDG_CONFIG_HOME/playlist-curator-mcp/config.json if present.
//   2. Overlay any matching env vars (NAVIDROME_URL, NAVIDROME_USER,
//      NAVIDROME_PASS, LIBRARY_ROOT, LOG_LEVEL) on top.
//   3. Validate against ConfigSchema. Throw on failure.
//
// Env-only mode: if there is no config file but the required env vars
// are present (NAVIDROME_URL + USER + PASS + LIBRARY_ROOT), we run with
// just defaults for everything else. That's the path Claude Desktop
// uses — it passes env vars via the mcpServers config block and never
// writes a file.

import fs from "node:fs";
import path from "node:path";
import { ConfigSchema, type Config } from "./schema.js";
import { getPaths } from "./paths.js";

function readJsonIfExists(filePath: string): unknown {
  try {
    const text = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(text);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new Error(
      `Could not read config at ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function applyEnvOverrides(base: Record<string, unknown>): Record<string, unknown> {
  const baseObj = (base ?? {}) as Record<string, Record<string, unknown> | undefined>;

  const navidrome = { ...(baseObj.navidrome ?? {}) };
  if (process.env.NAVIDROME_URL) navidrome.url = process.env.NAVIDROME_URL;
  if (process.env.NAVIDROME_USER) navidrome.user = process.env.NAVIDROME_USER;
  if (process.env.NAVIDROME_PASS) navidrome.password = process.env.NAVIDROME_PASS;

  const library = { ...(baseObj.library ?? {}) };
  if (process.env.LIBRARY_ROOT) library.root = process.env.LIBRARY_ROOT;

  const result: Record<string, unknown> = {
    ...baseObj,
    navidrome,
    library,
  };
  if (process.env.LOG_LEVEL) {
    result.log_level = process.env.LOG_LEVEL;
  }
  return result;
}

export interface LoadResult {
  config: Config;
  sourcePath: string | null;
}

export function loadConfig(explicitPath?: string): LoadResult {
  const paths = getPaths();
  const candidatePath = explicitPath ?? paths.configFile;
  const raw = readJsonIfExists(candidatePath);

  if (raw === null && !process.env.NAVIDROME_URL) {
    // No file, no env — most likely the user hasn't run `init` yet.
    throw new Error(
      `No configuration found.\n` +
        `  - Run \`playlist-curator-mcp init\` to create one at:\n` +
        `      ${candidatePath}\n` +
        `  - OR set the env vars NAVIDROME_URL, NAVIDROME_USER, NAVIDROME_PASS, LIBRARY_ROOT.`,
    );
  }

  const merged = applyEnvOverrides((raw as Record<string, unknown>) ?? {});

  const parsed = ConfigSchema.safeParse(merged);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Configuration is invalid:\n${issues}`);
  }

  return {
    config: parsed.data,
    sourcePath: raw === null ? null : candidatePath,
  };
}

export function writeConfig(config: Config, targetPath?: string): string {
  const paths = getPaths();
  const finalPath = targetPath ?? paths.configFile;
  fs.mkdirSync(path.dirname(finalPath), { recursive: true });
  fs.writeFileSync(finalPath, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
  return finalPath;
}
