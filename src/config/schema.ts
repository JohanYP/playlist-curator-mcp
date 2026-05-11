// Zod schema for the runtime configuration. The same schema validates
// both the on-disk config.json AND the env-var-derived overrides, so
// `init` writes can never produce an invalid file and `serve` never
// silently accepts a malformed config.

import { z } from "zod";

export const NavidromeSchema = z.object({
  url: z.string().url("navidrome.url must be a valid URL like http://navidrome.lan:4533"),
  user: z.string().min(1, "navidrome.user is required"),
  password: z.string().min(1, "navidrome.password is required"),
});

export const LibrarySchema = z.object({
  root: z.string().min(1, "library.root must be an absolute path Navidrome already scans"),
  downloads_subdir: z.string().default("Downloads"),
});

export const SourcesSchema = z.object({
  default: z.enum(["youtube"]).default("youtube"),
  youtube: z
    .object({
      audio_quality_kbps: z.number().int().positive().default(128),
      format: z.enum(["mp3", "opus", "m4a"]).default("mp3"),
    })
    .default({}),
});

export const PlaylistsSchema = z.object({
  today_rollover_local_time: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "expected HH:MM (local time)")
    .default("00:01"),
  weekly_radio_cron: z.string().default("0 6 * * 1"),
  weekly_radio_size: z.number().int().positive().max(200).default(30),
});

export const HistorySchema = z.object({
  scrobble_poll_minutes: z.number().int().positive().default(5),
});

export const TransportSchema = z.object({
  http_port: z.number().int().min(1).max(65535).default(4098),
});

export const LogLevelSchema = z.enum(["debug", "info", "warn", "error"]).default("info");

export const ConfigSchema = z.object({
  navidrome: NavidromeSchema,
  library: LibrarySchema,
  sources: SourcesSchema.default({}),
  playlists: PlaylistsSchema.default({}),
  history: HistorySchema.default({}),
  transport: TransportSchema.default({}),
  log_level: LogLevelSchema,
});

export type Config = z.infer<typeof ConfigSchema>;
