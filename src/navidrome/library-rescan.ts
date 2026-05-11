// Helpers around Navidrome's library scanner. After we yt-dlp a new
// track into the library folder, Navidrome's inotify will normally pick
// it up within seconds — but we trigger a scan explicitly to bound the
// latency, and poll until it stabilizes so the caller knows when the
// new track is queryable via search3.

import type { Config } from "../config/schema.js";
import { getClient } from "./client.js";
import { logger } from "../utils/logger.js";

export interface ScanStatus {
  scanning: boolean;
  count: number;
}

export async function triggerScan(config: Config): Promise<void> {
  await getClient(config).startScan();
}

export async function getScanStatus(config: Config): Promise<ScanStatus> {
  const result = await getClient(config).getScanStatus();
  if (result.status !== "ok") {
    return { scanning: false, count: 0 };
  }
  const status = result.scanStatus;
  return {
    scanning: Boolean(status.scanning),
    count: Number(status.count ?? 0),
  };
}

export interface WaitForScanOptions {
  /** Initial scan count BEFORE we trigger the scan, so we know when it grew. */
  baselineCount: number;
  /** Hard cap on total wait time (milliseconds). Default 60s. */
  timeoutMs?: number;
  /** Poll interval in milliseconds. Default 1000. */
  pollIntervalMs?: number;
}

/**
 * Triggers a scan and polls until either:
 *   - the scanner reports `count > baselineCount` AND it's no longer
 *     actively scanning, OR
 *   - `timeoutMs` elapses (returns false).
 *
 * Returns true when at least one new track has been indexed since the
 * baseline. False on timeout — caller decides whether to retry or fail.
 */
export async function waitForNewTrack(
  config: Config,
  options: WaitForScanOptions,
): Promise<boolean> {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const pollIntervalMs = options.pollIntervalMs ?? 1000;
  const startedAt = Date.now();

  await triggerScan(config);

  while (Date.now() - startedAt < timeoutMs) {
    await sleep(pollIntervalMs);
    const status = await getScanStatus(config);
    if (status.count > options.baselineCount && !status.scanning) {
      logger.debug(
        `[library-rescan] new track visible after ${Date.now() - startedAt}ms (count ${options.baselineCount} -> ${status.count})`,
      );
      return true;
    }
  }

  logger.warn(
    `[library-rescan] timed out after ${timeoutMs}ms waiting for count to exceed ${options.baselineCount}`,
  );
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
