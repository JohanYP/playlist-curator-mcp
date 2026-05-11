// Source provider registry. The default provider comes from
// config.sources.default; tools that take an optional `source` parameter
// can pick a specific provider by name. Phase 3 ships with only the
// youtube provider — V1.x will add more.

import type { Config } from "../config/schema.js";
import type { SourceProvider } from "./types.js";
import { youtubeSource } from "./youtube.js";

const PROVIDERS: Record<string, SourceProvider> = {
  youtube: youtubeSource,
};

export type SourceName = keyof typeof PROVIDERS;

export function listProviders(): string[] {
  return Object.keys(PROVIDERS);
}

export function getProvider(name?: string, config?: Config): SourceProvider {
  const resolvedName = name ?? config?.sources.default ?? "youtube";
  const provider = PROVIDERS[resolvedName];
  if (!provider) {
    throw new Error(
      `Unknown download source: ${resolvedName}. Available: ${listProviders().join(", ")}`,
    );
  }
  return provider;
}
