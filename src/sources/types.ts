// Contract every download source implements. Phase 3 only registers
// `youtube`; V1.x will add Deezer, Spotify+spotdl, etc.

import type { Config } from "../config/schema.js";

export interface DownloadResult {
  /** Absolute path to the audio file written to the library. */
  filePath: string;
  /** Original source URL we resolved (for logging / audit). */
  sourceUrl: string;
  /** Title as advertised by the source. */
  title: string;
  /** Reported artist when the source provides it. */
  artist?: string;
  /** Bitrate kbps when known. */
  bitrateKbps?: number;
  /** Duration seconds when known. */
  durationSec?: number;
}

export interface SourceProvider {
  /** Stable identifier used in config (e.g. "youtube"). */
  readonly name: string;
  /**
   * Download a track. The query can be either a free-text search
   * ("Holocene Bon Iver") OR a direct URL recognized by the provider.
   * Returns the absolute path of the resulting audio file in the
   * library.
   */
  download(query: string, config: Config): Promise<DownloadResult>;
}
