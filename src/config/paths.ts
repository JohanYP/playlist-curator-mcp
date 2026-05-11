// XDG-compliant paths for config, data and cache.
//
// We follow the XDG Base Directory Specification so the user's existing
// dotfile setup picks us up automatically:
//   $XDG_CONFIG_HOME/playlist-curator-mcp/config.json
//   $XDG_DATA_HOME/playlist-curator-mcp/history.db
//
// On macOS we still use XDG paths (not Application Support) because the
// MCP ecosystem at large treats Mac as a Unix and most users run dev
// tooling under HOME/.config anyway. Override is supported via env vars.

import os from "node:os";
import path from "node:path";

const HOME = os.homedir();

function xdgConfigHome(): string {
  return process.env.XDG_CONFIG_HOME?.trim() || path.join(HOME, ".config");
}

function xdgDataHome(): string {
  return process.env.XDG_DATA_HOME?.trim() || path.join(HOME, ".local", "share");
}

export interface Paths {
  configDir: string;
  configFile: string;
  dataDir: string;
  historyDb: string;
}

export function getPaths(): Paths {
  const configDir = path.join(xdgConfigHome(), "playlist-curator-mcp");
  const dataDir = path.join(xdgDataHome(), "playlist-curator-mcp");
  return {
    configDir,
    configFile: path.join(configDir, "config.json"),
    dataDir,
    historyDb: path.join(dataDir, "history.db"),
  };
}
