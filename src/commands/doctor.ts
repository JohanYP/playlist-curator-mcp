// `doctor` command — runs sanity checks on the environment.
// Phase 0: config validation + path resolution. Phase 6 adds the network
// pings (Navidrome reachability, yt-dlp in PATH, library writable, etc.).

import fs from "node:fs";
import path from "node:path";
import { logger, setLogLevel } from "../utils/logger.js";
import { loadConfig } from "../config/loader.js";
import { getPaths } from "../config/paths.js";

interface CheckResult {
  label: string;
  ok: boolean;
  detail?: string;
}

function ok(label: string, detail?: string): CheckResult {
  return { label, ok: true, detail };
}

function fail(label: string, detail: string): CheckResult {
  return { label, ok: false, detail };
}

export async function runDoctor(): Promise<number> {
  const results: CheckResult[] = [];

  try {
    const { config, sourcePath } = loadConfig();
    setLogLevel(config.log_level);
    results.push(ok("Configuration loads", sourcePath ?? "from env vars"));
    // Phase 0 doesn't ping the network yet; we still validate the path
    // is well-formed and absolute so the doctor catches typos.
    if (!path.isAbsolute(config.library.root)) {
      results.push(fail("library.root is absolute", `got: ${config.library.root}`));
    } else {
      results.push(ok("library.root is absolute"));
    }
  } catch (err) {
    results.push(fail("Configuration loads", err instanceof Error ? err.message : String(err)));
  }

  const paths = getPaths();
  results.push(
    fs.existsSync(paths.configDir)
      ? ok("Config directory exists", paths.configDir)
      : ok("Config directory missing (will be created on first write)", paths.configDir),
  );

  let failures = 0;
  for (const r of results) {
    const symbol = r.ok ? "✓" : "✗";
    const line = r.detail ? `${symbol} ${r.label} — ${r.detail}` : `${symbol} ${r.label}`;
    process.stderr.write(`${line}\n`);
    if (!r.ok) failures += 1;
  }

  if (failures > 0) {
    logger.error(`${failures} check(s) failed.`);
    return 1;
  }
  logger.info("All checks passed (Phase 0 set — network probes added in Phase 6).");
  return 0;
}
