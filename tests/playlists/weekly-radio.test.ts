// Tests for the weekly auto-curated radio.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const subsonic = vi.hoisted(() => ({
  instance: {
    getAlbumList2: vi.fn(),
    getAlbum: vi.fn(),
    getPlaylists: vi.fn(),
    getPlaylist: vi.fn(),
    createPlaylist: vi.fn(),
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
  playlists: { today_rollover_local_time: "00:01", weekly_radio_cron: "0 6 * * 1", weekly_radio_size: 5 },
  history: { scrobble_poll_minutes: 5 },
  transport: { http_port: 4098 },
  log_level: "warn" as const,
};

describe("playlists/weekly-radio", () => {
  beforeEach(async () => {
    Object.values(subsonic.instance).forEach((fn) => fn.mockReset());
    const { __resetClient } = await import("../../src/navidrome/client.js");
    __resetClient();
  });

  afterEach(() => vi.clearAllMocks());

  it("formatIsoWeek produces YYYY-Www", async () => {
    const { formatIsoWeek } = await import("../../src/playlists/weekly-radio.js");
    // 2026-05-11 is a Monday in ISO week 2026-W20
    expect(formatIsoWeek(new Date("2026-05-11T12:00:00Z"))).toBe("2026-W20");
    // Edge case: Jan 1 2025 is a Wednesday in W01
    expect(formatIsoWeek(new Date("2025-01-01T00:00:00Z"))).toBe("2025-W01");
  });

  it("formatWeeklyRadioName uses the Radio Semana prefix", async () => {
    const { formatWeeklyRadioName } = await import("../../src/playlists/weekly-radio.js");
    expect(formatWeeklyRadioName(new Date("2026-05-11T12:00:00Z"))).toBe("Radio Semana 2026-W20");
  });

  it("regenerateWeeklyRadio returns no_candidates when frequent list is empty", async () => {
    subsonic.instance.getAlbumList2.mockResolvedValue({
      status: "ok",
      albumList2: { album: [] },
    });

    const { regenerateWeeklyRadio } = await import("../../src/playlists/weekly-radio.js");
    const result = await regenerateWeeklyRadio(config);
    expect(result.status).toBe("no_candidates");
    expect(result.trackCount).toBe(0);
    expect(subsonic.instance.createPlaylist).not.toHaveBeenCalled();
  });

  it("regenerates by scoring tracks across frequent albums", async () => {
    subsonic.instance.getAlbumList2.mockResolvedValue({
      status: "ok",
      albumList2: { album: [{ id: "alb1" }, { id: "alb2" }] },
    });
    subsonic.instance.getAlbum.mockImplementation(async ({ id }: { id: string }) => {
      if (id === "alb1") {
        return {
          status: "ok",
          album: {
            id: "alb1",
            song: [
              { id: "t1", title: "Track A", artist: "X", playCount: 50, isDir: false },
              { id: "t2", title: "Track B", artist: "X", playCount: 30, isDir: false },
              { id: "t3", title: "Track C", artist: "X", playCount: 0, isDir: false },
            ],
          },
        };
      }
      return {
        status: "ok",
        album: {
          id: "alb2",
          song: [
            { id: "t4", title: "Track D", artist: "Y", playCount: 40, isDir: false },
            { id: "t5", title: "Track E", artist: "Y", playCount: 10, isDir: false },
          ],
        },
      };
    });
    subsonic.instance.getPlaylists.mockResolvedValue({
      status: "ok",
      playlists: { playlist: [] },
    });
    subsonic.instance.createPlaylist.mockResolvedValue({
      status: "ok",
      playlist: { id: "new", name: "Radio Semana 2026-W20", songCount: 4, duration: 0 },
    });

    const { regenerateWeeklyRadio } = await import("../../src/playlists/weekly-radio.js");
    const result = await regenerateWeeklyRadio(config);
    expect(result.status).toBe("regenerated");
    // weekly_radio_size = 5; 4 tracks have playCount > 0 so we get 4.
    expect(result.trackCount).toBe(4);
    // createPlaylist should have received the song ids of the four scored tracks
    const createArgs = subsonic.instance.createPlaylist.mock.calls[0]?.[0];
    expect(createArgs.songId).toBeDefined();
    expect((createArgs.songId as string[]).length).toBe(4);
  });

  it("getWeeklyRadio returns the current week's playlist", async () => {
    const { formatWeeklyRadioName, getWeeklyRadio } = await import(
      "../../src/playlists/weekly-radio.js"
    );
    const expectedName = formatWeeklyRadioName();
    subsonic.instance.getPlaylists.mockResolvedValue({
      status: "ok",
      playlists: { playlist: [{ id: "r1", name: expectedName, songCount: 30, duration: 0 }] },
    });
    subsonic.instance.getPlaylist.mockResolvedValue({
      status: "ok",
      playlist: {
        id: "r1",
        name: expectedName,
        songCount: 1,
        duration: 0,
        entry: [{ id: "t1", title: "x" }],
      },
    });

    const result = await getWeeklyRadio(config);
    expect(result?.id).toBe("r1");
    expect(result?.tracks).toHaveLength(1);
  });
});
