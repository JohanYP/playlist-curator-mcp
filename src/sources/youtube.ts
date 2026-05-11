// yt-dlp wrapper. We invoke the binary as a subprocess; everything the
// caller needs (file path, title, etc.) we recover from yt-dlp's
// `--print` JSON output after the download finishes.
//
// We deliberately keep this thin — no fluent-ffmpeg or wrapper libs.
// yt-dlp's CLI is the lingua franca of audio-extraction; pinning to its
// interface keeps us compatible across yt-dlp versions and makes the
// behavior easy to debug from a terminal.

import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import type { Config } from "../config/schema.js";
import type { DownloadResult, SourceProvider } from "./types.js";
import { ensureDownloadsDir } from "../library/paths.js";
import { sanitizeFilename } from "../library/filename.js";
import { logger } from "../utils/logger.js";

const DOWNLOAD_TIMEOUT_MS = 5 * 60_000;

interface YtDlpMetadata {
  filepath: string;
  title: string;
  artist?: string;
  uploader?: string;
  duration?: number;
  abr?: number;
  webpage_url?: string;
}

function ytDlpBinary(): string {
  return process.env.YT_DLP_BIN || "yt-dlp";
}

export const youtubeSource: SourceProvider = {
  name: "youtube",
  async download(query: string, config: Config): Promise<DownloadResult> {
    const downloadsDir = ensureDownloadsDir(config);
    const bitrate = config.sources.youtube.audio_quality_kbps;
    const format = config.sources.youtube.format;

    // Output template: yt-dlp expands %(title)s etc. from the metadata.
    // We sanitize via --restrict-filenames so the resulting path is
    // FS-safe everywhere without having to post-rename.
    const outputTemplate = path.join(downloadsDir, "%(title)s.%(ext)s");

    // Decide what to actually pass yt-dlp. If `query` looks like a URL,
    // pass it directly. Otherwise prefix with `ytsearch1:` so yt-dlp
    // searches YouTube and picks the top result. This is the standard
    // pattern used by every Telegram music bot under the hood.
    const target = looksLikeUrl(query) ? query : `ytsearch1:${query}`;

    const args = [
      "--no-progress",
      "--restrict-filenames",
      "--no-playlist",
      "-f",
      "bestaudio/best",
      "-x",
      "--audio-format",
      format,
      "--audio-quality",
      `${bitrate}K`,
      "--embed-metadata",
      "--add-metadata",
      "--no-mtime",
      "-o",
      outputTemplate,
      // After downloading, print the final file path + selected metadata
      // as one JSON line we can parse. `--print after_move:` runs once
      // per item AFTER the extracted file is in its final location.
      "--print",
      "after_move:%(.{filepath,title,artist,uploader,duration,abr,webpage_url})j",
      target,
    ];

    logger.info(`[yt-dlp] downloading ${target}`);
    logger.debug(`[yt-dlp] argv`, args);

    const { stdout, stderr } = await runProcess(ytDlpBinary(), args, DOWNLOAD_TIMEOUT_MS);

    // yt-dlp can emit several lines (one per playlist item etc.). We
    // take the last line that parses cleanly, which is the entry we
    // just produced.
    const metadata = parseLastJsonLine(stdout);
    if (!metadata) {
      throw new Error(
        `yt-dlp finished but did not emit a JSON metadata line.\n` +
          `Captured stderr (tail): ${tail(stderr, 3)}`,
      );
    }

    if (!fs.existsSync(metadata.filepath)) {
      throw new Error(`yt-dlp claimed to produce ${metadata.filepath} but the file is missing.`);
    }

    // yt-dlp's restrict-filenames already FS-safed the name, but if a
    // user enabled custom flags via env (e.g. YT_DLP_EXTRA_ARGS) the
    // path could still have unfriendly characters. Defensive rename.
    const targetName = sanitizeFilename(path.basename(metadata.filepath));
    const targetPath = path.join(path.dirname(metadata.filepath), targetName);
    if (targetPath !== metadata.filepath && !fs.existsSync(targetPath)) {
      fs.renameSync(metadata.filepath, targetPath);
    }

    return {
      filePath: fs.existsSync(targetPath) ? targetPath : metadata.filepath,
      sourceUrl: metadata.webpage_url ?? target,
      title: metadata.title,
      artist: metadata.artist ?? metadata.uploader,
      bitrateKbps: metadata.abr,
      durationSec: metadata.duration,
    };
  },
};

function looksLikeUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function parseLastJsonLine(stdout: string): YtDlpMetadata | null {
  const lines = stdout
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .reverse();
  for (const line of lines) {
    if (!line.startsWith("{")) continue;
    try {
      return JSON.parse(line) as YtDlpMetadata;
    } catch {
      continue;
    }
  }
  return null;
}

function tail(text: string, lines: number): string {
  return text.split("\n").slice(-lines).join(" | ");
}

interface ProcessResult {
  stdout: string;
  stderr: string;
}

function runProcess(bin: string, args: string[], timeoutMs: number): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      reject(new Error(`${bin} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (b: Buffer) => {
      stdout += b.toString("utf8");
    });
    child.stderr.on("data", (b: Buffer) => {
      stderr += b.toString("utf8");
    });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(
        err.message.includes("ENOENT")
          ? new Error(
              `Could not find ${bin}. Install yt-dlp (e.g. \`pip install yt-dlp\` or your distro's package).`,
            )
          : err,
      );
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`${bin} exited ${code}. stderr tail: ${tail(stderr, 5)}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}
