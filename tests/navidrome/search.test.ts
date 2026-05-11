import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fakeSubsonic = vi.hoisted(() => ({
  instance: { search3: vi.fn() },
}));

vi.mock("subsonic-api", () => ({
  default: vi.fn().mockImplementation(() => fakeSubsonic.instance),
}));

const config = {
  navidrome: { url: "http://test", user: "u", password: "p" },
  library: { root: "/x", downloads_subdir: "Downloads" },
  sources: { default: "youtube" as const, youtube: { audio_quality_kbps: 128, format: "mp3" as const } },
  playlists: { today_rollover_local_time: "00:01", weekly_radio_cron: "0 6 * * 1", weekly_radio_size: 30 },
  history: { scrobble_poll_minutes: 5 },
  transport: { http_port: 4098 },
  log_level: "info" as const,
};

describe("navidrome/search", () => {
  beforeEach(async () => {
    fakeSubsonic.instance.search3.mockReset();
    const { __resetClient } = await import("../../src/navidrome/client.js");
    __resetClient();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns an empty array for blank queries without hitting the API", async () => {
    const { searchTracks } = await import("../../src/navidrome/search.js");
    expect(await searchTracks(config, "")).toEqual([]);
    expect(await searchTracks(config, "   ")).toEqual([]);
    expect(fakeSubsonic.instance.search3).not.toHaveBeenCalled();
  });

  it("maps search3 song results onto TrackHit", async () => {
    fakeSubsonic.instance.search3.mockResolvedValue({
      status: "ok",
      searchResult3: {
        song: [
          { id: "s1", title: "Holocene", artist: "Bon Iver", album: "Bon Iver", duration: 337, year: 2011 },
          { id: "s2", title: "Skinny Love", artist: "Bon Iver", duration: 238 },
        ],
      },
    });

    const { searchTracks } = await import("../../src/navidrome/search.js");
    const hits = await searchTracks(config, "Bon Iver", 25);
    expect(hits).toHaveLength(2);
    expect(hits[0]).toMatchObject({ id: "s1", title: "Holocene", year: 2011 });
    expect(fakeSubsonic.instance.search3).toHaveBeenCalledWith({
      query: "Bon Iver",
      songCount: 25,
      artistCount: 0,
      albumCount: 0,
    });
  });

  it("returns empty array on failed response", async () => {
    fakeSubsonic.instance.search3.mockResolvedValue({
      status: "failed",
      error: { code: 0 },
    });

    const { searchTracks } = await import("../../src/navidrome/search.js");
    expect(await searchTracks(config, "anything")).toEqual([]);
  });
});
