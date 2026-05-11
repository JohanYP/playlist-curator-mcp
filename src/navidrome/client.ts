// Thin factory over the `subsonic-api` package. We hold a single
// SubsonicAPI instance per process — it's safe to share across tools.
//
// All higher-level modules under src/navidrome/* import getClient()
// rather than constructing their own, so we can swap or stub the
// underlying client in tests with a single mock.

import SubsonicAPI from "subsonic-api";
import type { Config } from "../config/schema.js";

let cached: SubsonicAPI | null = null;
let cachedFor: { url: string; user: string } | null = null;

export function getClient(config: Config): SubsonicAPI {
  const id = { url: config.navidrome.url, user: config.navidrome.user };
  if (cached && cachedFor && cachedFor.url === id.url && cachedFor.user === id.user) {
    return cached;
  }

  cached = new SubsonicAPI({
    url: config.navidrome.url,
    auth: {
      username: config.navidrome.user,
      password: config.navidrome.password,
    },
    // Reuse the salt per-session to amortize the md5(salt + token)
    // hashing cost. Each "session" is the lifetime of this process.
    reuseSalt: true,
  });
  cachedFor = id;
  return cached;
}

/**
 * Reset the cached client. Only meant for tests.
 */
export function __resetClient(): void {
  cached = null;
  cachedFor = null;
}

/**
 * Verifies the credentials by calling /rest/ping. Throws on any
 * non-"ok" response, so callers can `await ping(config)` inside their
 * doctor/init flows to surface configuration mistakes early.
 */
export async function ping(config: Config): Promise<void> {
  const result = await getClient(config).ping();
  if (result.status !== "ok") {
    throw new Error(
      `Navidrome ping failed: ${result.status === "failed" ? result.error.message ?? result.error.code : "unknown"}`,
    );
  }
}
