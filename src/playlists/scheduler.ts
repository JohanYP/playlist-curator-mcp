// Background scheduler. Two cron jobs:
//   1. Daily rollover at config.playlists.today_rollover_local_time:
//      purges yesterday's `today (...)` playlists from Navidrome.
//   2. Weekly radio regeneration at config.playlists.weekly_radio_cron
//      (default Monday 06:00 local). Phase 5 wires the actual algorithm;
//      Phase 4 just shows the scaffolding so callers can register the
//      job once everything else is ready.
//
// Croner gives us local-time scheduling without pulling in a heavy
// cron lib. We hold the Cron handles so `stop()` can cancel them cleanly
// on SIGTERM.

import { Cron } from "croner";
import type { Config } from "../config/schema.js";
import { logger } from "../utils/logger.js";
import { purgeStaleTodayPlaylists } from "./daily.js";

export interface ScheduledJobs {
  /** Cancels all scheduled jobs. Idempotent. */
  stop(): void;
}

export interface SchedulerHooks {
  /**
   * Called when the weekly radio cron fires. Phase 4 leaves this as a
   * stub that the caller can override later; Phase 5 wires a real
   * regenerator.
   */
  onWeeklyRadioTick?: () => Promise<void>;
}

export function startScheduler(config: Config, hooks: SchedulerHooks = {}): ScheduledJobs {
  const jobs: Cron[] = [];

  // Daily rollover. We convert "HH:MM" into a cron expression so the
  // rest of the file doesn't have to special-case ad-hoc formats.
  const [hh, mm] = parseClock(config.playlists.today_rollover_local_time);
  const dailyCron = `${mm} ${hh} * * *`;

  jobs.push(
    new Cron(
      dailyCron,
      { name: "daily-rollover" },
      async () => {
        logger.info("[scheduler] daily rollover firing");
        try {
          const result = await purgeStaleTodayPlaylists(config);
          if (result.deleted.length > 0) {
            logger.info(`[scheduler] deleted ${result.deleted.length} stale today playlist(s)`);
          }
        } catch (err) {
          logger.error("[scheduler] daily rollover failed", err);
        }
      },
    ),
  );

  // Weekly radio cron. Always registered; the hook decides whether
  // anything actually runs.
  jobs.push(
    new Cron(
      config.playlists.weekly_radio_cron,
      { name: "weekly-radio" },
      async () => {
        logger.info("[scheduler] weekly radio firing");
        try {
          await hooks.onWeeklyRadioTick?.();
        } catch (err) {
          logger.error("[scheduler] weekly radio failed", err);
        }
      },
    ),
  );

  logger.info(
    `[scheduler] started: daily="${dailyCron}", weekly="${config.playlists.weekly_radio_cron}"`,
  );

  return {
    stop() {
      for (const job of jobs) {
        try {
          job.stop();
        } catch (err) {
          logger.debug("[scheduler] stop() threw", err);
        }
      }
    },
  };
}

function parseClock(value: string): [number, number] {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    throw new Error(`Invalid clock value: ${value}. Expected HH:MM.`);
  }
  return [Number(match[1]), Number(match[2])];
}
