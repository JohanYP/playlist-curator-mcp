// Tests for the ephemeral today playlist lifecycle.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const subsonic = vi.hoisted(() => ({
  instance: {
    getPlaylists: vi.fn(),
    getPlaylist: vi.fn(),
    createPlaylist: vi.fn(),
    updatePlaylist: vi.fn(),
    deletePlaylist: vi.fn(),
  },
}));

vi.mock("subsonic-api", () => ({
  default: vi.fn().mockImplementation(() => subsonic.instance),
}));

const config = {
  navidrome: { url: "http://test", user: "u", password: "p" },
  library: { root: "/x", downloads_subdir: "Downloads" },
  sources: { default: "youtube" as const, youtube: { audio_quality_kbps: 128, format: "mp3" as const } },
  playlists: { today_rollover_local_time: "00:01", weekly_radio_cron: "0 6 * * 1", weekly_radio_size: 30 },
  history: { scrobble_poll_minutes: 5 },
  transport: { http_port: 4098 },
  log_level: "warn" as const,
};

describe("playlists/daily", () => {
  beforeEach(async () => {
    subsonic.instance.getPlaylists.mockReset();
    subsonic.instance.getPlaylist.mockReset();
    subsonic.instance.createPlaylist.mockReset();
    subsonic.instance.updatePlaylist.mockReset();
    subsonic.instance.deletePlaylist.mockReset();
    const { __resetClient } = await import("../../src/navidrome/client.js");
    __resetClient();
  });

  afterEach(() => vi.clearAllMocks());

  it("formatTodayName uses local YYYY-MM-DD", async () => {
    const { formatTodayName } = await import("../../src/playlists/daily.js");
    const fixed = new Date("2026-05-11T18:30:00");
    expect(formatTodayName(fixed)).toBe("today (2026-05-11)");
  });

  it("isTodayName matches the canonical shape only", async () => {
    const { isTodayName } = await import("../../src/playlists/daily.js");
    expect(isTodayName("today (2026-05-11)")).toBe(true);
    expect(isTodayName("Today (2026-05-11)")).toBe(false); // case-sensitive on purpose
    expect(isTodayName("today")).toBe(false);
    expect(isTodayName("not-today (2026-05-11)")).toBe(false);
  });

  it("getOrCreateToday returns existing today instead of creating", async () => {
    const todayName = (await import("../../src/playlists/daily.js")).formatTodayName();
    subsonic.instance.getPlaylists.mockResolvedValue({
      status: "ok",
      playlists: { playlist: [{ id: "t1", name: todayName, songCount: 3, duration: 0 }] },
    });

    const { getOrCreateToday } = await import("../../src/playlists/daily.js");
    const result = await getOrCreateToday(config);
    expect(result.id).toBe("t1");
    expect(subsonic.instance.createPlaylist).not.toHaveBeenCalled();
  });

  it("getOrCreateToday creates when missing", async () => {
    const todayName = (await import("../../src/playlists/daily.js")).formatTodayName();
    subsonic.instance.getPlaylists.mockResolvedValue({
      status: "ok",
      playlists: { playlist: [] },
    });
    subsonic.instance.createPlaylist.mockResolvedValue({
      status: "ok",
      playlist: { id: "new", name: todayName, songCount: 0, duration: 0 },
    });

    const { getOrCreateToday } = await import("../../src/playlists/daily.js");
    const result = await getOrCreateToday(config);
    expect(result.id).toBe("new");
    expect(subsonic.instance.createPlaylist).toHaveBeenCalledWith({
      name: todayName,
      songId: undefined,
    });
  });

  it("purgeStaleTodayPlaylists deletes only old today (...) playlists", async () => {
    const { formatTodayName, purgeStaleTodayPlaylists } = await import(
      "../../src/playlists/daily.js"
    );
    const today = formatTodayName();
    subsonic.instance.getPlaylists.mockResolvedValue({
      status: "ok",
      playlists: {
        playlist: [
          { id: "1", name: "today (2026-01-01)", songCount: 0, duration: 0 },
          { id: "2", name: "today (2025-12-25)", songCount: 0, duration: 0 },
          { id: "3", name: today, songCount: 0, duration: 0 },
          { id: "4", name: "Workout", songCount: 0, duration: 0 },
          { id: "5", name: "Saturday Vibes", songCount: 0, duration: 0 },
        ],
      },
    });
    subsonic.instance.deletePlaylist.mockResolvedValue({ status: "ok" });

    const result = await purgeStaleTodayPlaylists(config);

    expect(result.deleted.sort()).toEqual(
      ["today (2025-12-25)", "today (2026-01-01)"].sort(),
    );
    // Today and user-named playlists are NEVER touched.
    expect(subsonic.instance.deletePlaylist).not.toHaveBeenCalledWith({ id: "3" });
    expect(subsonic.instance.deletePlaylist).not.toHaveBeenCalledWith({ id: "4" });
    expect(subsonic.instance.deletePlaylist).not.toHaveBeenCalledWith({ id: "5" });
  });

  it("saveTodayAs renames the playlist and refuses name collisions", async () => {
    const { formatTodayName, saveTodayAs } = await import("../../src/playlists/daily.js");
    const today = formatTodayName();

    // First call (saveTodayAs success path) sees today exists; "rainy monday"
    // does not exist.
    subsonic.instance.getPlaylists.mockResolvedValueOnce({
      status: "ok",
      playlists: { playlist: [{ id: "t1", name: today, songCount: 0, duration: 0 }] },
    });
    subsonic.instance.getPlaylists.mockResolvedValueOnce({
      status: "ok",
      playlists: { playlist: [{ id: "t1", name: today, songCount: 0, duration: 0 }] },
    });
    subsonic.instance.updatePlaylist.mockResolvedValue({
      status: "ok",
      playlist: { id: "t1", name: "rainy monday", songCount: 0, duration: 0 },
    });

    const ok = await saveTodayAs(config, "rainy monday");
    expect(ok.savedAs).toBe("rainy monday");

    // Second call: there's a clash.
    subsonic.instance.getPlaylists.mockReset();
    subsonic.instance.getPlaylists.mockResolvedValueOnce({
      status: "ok",
      playlists: { playlist: [{ id: "t1", name: today, songCount: 0, duration: 0 }] },
    });
    subsonic.instance.getPlaylists.mockResolvedValueOnce({
      status: "ok",
      playlists: {
        playlist: [
          { id: "t1", name: today, songCount: 0, duration: 0 },
          { id: "x", name: "rainy monday", songCount: 0, duration: 0 },
        ],
      },
    });

    await expect(saveTodayAs(config, "rainy monday")).rejects.toThrow(/already exists/);
  });

  it("clearToday removes every track by position", async () => {
    const { formatTodayName, clearToday } = await import("../../src/playlists/daily.js");
    const today = formatTodayName();
    subsonic.instance.getPlaylists.mockResolvedValue({
      status: "ok",
      playlists: { playlist: [{ id: "t1", name: today, songCount: 3, duration: 0 }] },
    });
    subsonic.instance.getPlaylist.mockResolvedValue({
      status: "ok",
      playlist: {
        id: "t1",
        name: today,
        songCount: 3,
        duration: 0,
        entry: [
          { id: "a", title: "A" },
          { id: "b", title: "B" },
          { id: "c", title: "C" },
        ],
      },
    });
    subsonic.instance.updatePlaylist.mockResolvedValue({
      status: "ok",
      playlist: { id: "t1", name: today, songCount: 0, duration: 0 },
    });

    const result = await clearToday(config);
    expect(result.removed).toBe(3);
    expect(subsonic.instance.updatePlaylist).toHaveBeenCalledWith({
      playlistId: "t1",
      songIndexToRemove: [0, 1, 2],
    });
  });
});
