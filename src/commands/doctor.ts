// `doctor` command — sanity-checks the environment before the user
// burns time debugging a misconfigured setup. Runs every check
// independently and reports each so a single failure doesn't hide the
// rest.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { logger, setLogLevel } from "../utils/logger.js";
import { loadConfig } from "../config/loader.js";
import { getPaths } from "../config/paths.js";
import { ping } from "../navidrome/client.js";

interface CheckResult {
  label: string;
  ok: boolean;
  detail?: string;
}

const ok = (label: string, detail?: string): CheckResult => ({ label, ok: true, detail });
const fail = (label: string, detail: string): CheckResult => ({ label, ok: false, detail });

export async function runDoctor(): Promise<number> {
  const results: CheckResult[] = [];
  let config: Awaited<ReturnType<typeof loadConfig>>["config"] | null = null;

  // 1) Config loads & is valid.
  try {
    const loaded = loadConfig();
    config = loaded.config;
    setLogLevel(config.log_level);
    results.push(ok("Configuration loads", loaded.sourcePath ?? "from env vars"));
  } catch (err) {
    results.push(fail("Configuration loads", err instanceof Error ? err.message : String(err)));
  }

  // 2) Config directory.
  const paths = getPaths();
  results.push(
    fs.existsSync(paths.configDir)
      ? ok("Config directory exists", paths.configDir)
      : ok("Config directory missing (will be created on first write)", paths.configDir),
  );

  // 3) library.root exists + is writable (we drop downloads here).
  if (config) {
    const libRoot = path.resolve(config.library.root);
    if (!fs.existsSync(libRoot)) {
      results.push(fail("library.root exists", `not found: ${libRoot}`));
    } else {
      try {
        fs.accessSync(libRoot, fs.constants.R_OK | fs.constants.W_OK);
        results.push(ok("library.root is readable + writable", libRoot));
      } catch {
        results.push(fail("library.root is writable", `no write access: ${libRoot}`));
      }
    }
  }

  // 4) yt-dlp on PATH (downloads require it).
  results.push(checkBinary(process.env.YT_DLP_BIN || "yt-dlp", "yt-dlp", "--version"));

  // 5) ffmpeg on PATH (yt-dlp needs it for audio extraction to mp3).
  // ffmpeg uses single-dash flags (POSIX-ish, not GNU); `--version`
  // makes it error out with "Unrecognized option '-version'".
  results.push(checkBinary("ffmpeg", "ffmpeg", "-version"));

  // 6) Navidrome reachability.
  if (config) {
    try {
      await ping(config);
      results.push(ok("Navidrome ping", config.navidrome.url));
    } catch (err) {
      results.push(
        fail(
          "Navidrome ping",
          `${config.navidrome.url} — ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }
  }

  // Render the results table.
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
  logger.info("All checks passed.");
  return 0;
}

function checkBinary(binary: string, label: string, versionFlag: string): CheckResult {
  try {
    const result = spawnSync(binary, [versionFlag], { stdio: ["ignore", "pipe", "pipe"] });
    if (result.error) {
      const code = (result.error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        return fail(
          `${label} on PATH`,
          `not found. Install with your package manager (e.g. apt/brew/pip).`,
        );
      }
      return fail(`${label} on PATH`, result.error.message);
    }
    if (result.status !== 0) {
      return fail(`${label} on PATH`, `${binary} --version exited ${result.status}`);
    }
    // Trim the version banner to a single line for the report.
    const version = (result.stdout?.toString() ?? "").split("\n")[0]?.trim() ?? "";
    return ok(`${label} on PATH`, version || binary);
  } catch (err) {
    return fail(`${label} on PATH`, err instanceof Error ? err.message : String(err));
  }
}
