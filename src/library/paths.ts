// Resolves where downloads land inside the user-configured library
// root. Navidrome scans the root recursively, so we just drop into a
// subdirectory (config.library.downloads_subdir, default "Downloads/")
// and let Navidrome find the file.

import path from "node:path";
import fs from "node:fs";
import type { Config } from "../config/schema.js";

export interface LibraryPaths {
  root: string;
  downloads: string;
}

export function getLibraryPaths(config: Config): LibraryPaths {
  const root = path.resolve(config.library.root);
  const downloads = path.join(root, config.library.downloads_subdir);
  return { root, downloads };
}

/**
 * Ensures the downloads directory exists. Idempotent.
 * We DON'T try to mkdir the library root itself — if that's missing,
 * something is seriously wrong with the user's Navidrome setup and we
 * want to surface the error instead of silently creating it.
 */
export function ensureDownloadsDir(config: Config): string {
  const paths = getLibraryPaths(config);
  if (!fs.existsSync(paths.root)) {
    throw new Error(
      `library.root does not exist: ${paths.root}\n` +
        `Set LIBRARY_ROOT (or library.root in config.json) to the path Navidrome is scanning.`,
    );
  }
  if (!fs.existsSync(paths.downloads)) {
    fs.mkdirSync(paths.downloads, { recursive: true });
  }
  return paths.downloads;
}
