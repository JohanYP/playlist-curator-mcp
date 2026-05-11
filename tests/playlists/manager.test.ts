// Tests for the high-level playlists/manager.addByQuery flow. We mock
// both Subsonic and the download source so we can exercise:
//   - "track already exists in library → just add"
//   - "track missing → provider downloads → scan finds it → add"
//   - "track missing → download succeeds but scan times out"
//   - "playlist not found"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const subsonic = vi.hoisted(() => ({
  instance: {
    getPlaylists: vi.fn(),
    updatePlaylist: vi.fn(),
    search3: vi.fn(),
    getScanStatus: vi.fn(),
    startScan: vi.fn(),
  },
}));

vi.mock("subsonic-api", () => ({
  default: vi.fn().mockImplementation(() => subsonic.instance),
}));

const downloadMock = vi.hoisted(() => vi.fn());

vi.mock("../../src/sources/youtube.js", () => ({
  youtubeSource: {
    name: "youtube",
    download: downloadMock,
  },
}));

const config = {
  navidrome: { url: "http://test", user: "u", password: "p" },
  library: { root: "/tmp/x", downloads_subdir: "Downloads" },
  sources: { default: "youtube" as const, youtube: { audio_quality_kbps: 128, format: "mp3" as const } },
  playlists: { today_rollover_local_time: "00:01", weekly_radio_cron: "0 6 * * 1", weekly_radio_size: 30 },
  history: { scrobble_poll_minutes: 5 },
  transport: { http_port: 4098 },
  log_level: "warn" as const,
};

describe("playlists/manager.addByQuery", () => {
  beforeEach(async () => {
    subsonic.instance.getPlaylists.mockReset();
    subsonic.instance.updatePlaylist.mockReset();
    subsonic.instance.search3.mockReset();
    subsonic.instance.getScanStatus.mockReset();
    subsonic.instance.startScan.mockReset();
    downloadMock.mockReset();
    const { __resetClient } = await import("../../src/navidrome/client.js");
    __resetClient();
  });

  afterEach(() => vi.clearAllMocks());

  it("adds an existing track without downloading", async () => {
    subsonic.instance.getPlaylists.mockResolvedValue({
      status: "ok",
      playlists: { playlist: [{ id: "p1", name: "today", songCount: 0, duration: 0 }] },
    });
    subsonic.instance.search3.mockResolvedValue({
      status: "ok",
      searchResult3: { song: [{ id: "s99", title: "Holocene", artist: "Bon Iver" }] },
    });
    subsonic.instance.updatePlaylist.mockResolvedValue({
      status: "ok",
      playlist: { id: "p1", name: "today", songCount: 1, duration: 0 },
    });

    const { addByQuery } = await import("../../src/playlists/manager.js");
    const out = await addByQuery(config, "today", "Holocene Bon Iver");
    expect(out.status).toBe("added_existing");
    if (out.status === "added_existing") {
      expect(out.track.id).toBe("s99");
    }
    expect(downloadMock).not.toHaveBeenCalled();
  });

  it("downloads when the track is missing, then adds it", async () => {
    subsonic.instance.getPlaylists.mockResolvedValue({
      status: "ok",
      playlists: { playlist: [{ id: "p1", name: "today", songCount: 0, duration: 0 }] },
    });
    // First search: miss. Second search after download: hit.
    subsonic.instance.search3
      .mockResolvedValueOnce({ status: "ok", searchResult3: { song: [] } })
      .mockResolvedValueOnce({
        status: "ok",
        searchResult3: { song: [{ id: "new-id", title: "Test Song", artist: "X" }] },
      });

    subsonic.instance.getScanStatus
      .mockResolvedValueOnce({ status: "ok", scanStatus: { scanning: false, count: 100 } })
      // After we trigger the scan: count grows
      .mockResolvedValue({ status: "ok", scanStatus: { scanning: false, count: 101 } });
    subsonic.instance.startScan.mockResolvedValue({ status: "ok" });
    subsonic.instance.updatePlaylist.mockResolvedValue({
      status: "ok",
      playlist: { id: "p1", name: "today", songCount: 1, duration: 0 },
    });

    downloadMock.mockResolvedValue({
      filePath: "/tmp/Test Song.mp3",
      sourceUrl: "https://youtube.com/watch?v=xyz",
      title: "Test Song",
      artist: "X",
      bitrateKbps: 128,
    });

    const { addByQuery } = await import("../../src/playlists/manager.js");
    const out = await addByQuery(config, "today", "Test Song X", {
      scanTimeoutMs: 5_000,
    });

    expect(out.status).toBe("downloaded_and_added");
    if (out.status === "downloaded_and_added") {
      expect(out.track.id).toBe("new-id");
      expect(out.download.title).toBe("Test Song");
    }
    expect(downloadMock).toHaveBeenCalledTimes(1);
  });

  it("reports playlist_not_found when the playlist doesn't exist", async () => {
    subsonic.instance.getPlaylists.mockResolvedValue({
      status: "ok",
      playlists: { playlist: [] },
    });

    const { addByQuery } = await import("../../src/playlists/manager.js");
    const out = await addByQuery(config, "nope", "anything");
    expect(out.status).toBe("playlist_not_found");
  });

  it("reports downloaded_but_not_indexed when scan times out", async () => {
    subsonic.instance.getPlaylists.mockResolvedValue({
      status: "ok",
      playlists: { playlist: [{ id: "p1", name: "today", songCount: 0, duration: 0 }] },
    });
    // search miss before download AND miss after download
    subsonic.instance.search3.mockResolvedValue({
      status: "ok",
      searchResult3: { song: [] },
    });
    // scan never grows
    subsonic.instance.getScanStatus.mockResolvedValue({
      status: "ok",
      scanStatus: { scanning: false, count: 100 },
    });
    subsonic.instance.startScan.mockResolvedValue({ status: "ok" });

    downloadMock.mockResolvedValue({
      filePath: "/tmp/song.mp3",
      sourceUrl: "https://yt/x",
      title: "Stuck Song",
    });

    const { addByQuery } = await import("../../src/playlists/manager.js");
    const out = await addByQuery(config, "today", "Stuck Song", { scanTimeoutMs: 200 });
    expect(out.status).toBe("downloaded_but_not_indexed");
  });
});
