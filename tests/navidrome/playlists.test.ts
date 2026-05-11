// Tests for the playlist wrappers. We mock the subsonic-api default
// export with a tiny in-memory fake so we don't need a live Navidrome.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface FakePlaylist {
  id: string;
  name: string;
  songCount: number;
  duration: number;
  comment?: string;
  created?: string | Date;
  changed?: string | Date;
  entry?: Array<{ id: string; title: string; artist?: string; album?: string; duration?: number }>;
}

const state: { playlists: FakePlaylist[] } = { playlists: [] };

const fakeSubsonic = vi.hoisted(() => {
  return {
    instance: {
      getPlaylists: vi.fn(),
      getPlaylist: vi.fn(),
      createPlaylist: vi.fn(),
      updatePlaylist: vi.fn(),
      deletePlaylist: vi.fn(),
    },
  };
});

vi.mock("subsonic-api", () => {
  return {
    default: vi.fn().mockImplementation(() => fakeSubsonic.instance),
  };
});

const config = {
  navidrome: { url: "http://test", user: "u", password: "p" },
  library: { root: "/x", downloads_subdir: "Downloads" },
  sources: { default: "youtube" as const, youtube: { audio_quality_kbps: 128, format: "mp3" as const } },
  playlists: { today_rollover_local_time: "00:01", weekly_radio_cron: "0 6 * * 1", weekly_radio_size: 30 },
  history: { scrobble_poll_minutes: 5 },
  transport: { http_port: 4098 },
  log_level: "info" as const,
};

describe("navidrome/playlists", () => {
  beforeEach(async () => {
    state.playlists = [];
    fakeSubsonic.instance.getPlaylists.mockReset();
    fakeSubsonic.instance.getPlaylist.mockReset();
    fakeSubsonic.instance.createPlaylist.mockReset();
    fakeSubsonic.instance.updatePlaylist.mockReset();
    fakeSubsonic.instance.deletePlaylist.mockReset();
    const { __resetClient } = await import("../../src/navidrome/client.js");
    __resetClient();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("lists playlists and normalizes summary fields", async () => {
    fakeSubsonic.instance.getPlaylists.mockResolvedValue({
      status: "ok",
      playlists: {
        playlist: [
          {
            id: "1",
            name: "Today (2026-05-11)",
            songCount: 4,
            duration: 720,
            created: new Date("2026-05-11T00:01:00Z"),
            changed: new Date("2026-05-11T18:00:00Z"),
          },
          { id: "2", name: "Workout", songCount: 12, duration: 2400 },
        ],
      },
    });

    const { listPlaylists } = await import("../../src/navidrome/playlists.js");
    const list = await listPlaylists(config);

    expect(list).toEqual([
      {
        id: "1",
        name: "Today (2026-05-11)",
        songCount: 4,
        duration: 720,
        comment: undefined,
        createdAt: "2026-05-11T00:01:00.000Z",
        changedAt: "2026-05-11T18:00:00.000Z",
      },
      {
        id: "2",
        name: "Workout",
        songCount: 12,
        duration: 2400,
        comment: undefined,
        createdAt: undefined,
        changedAt: undefined,
      },
    ]);
  });

  it("findPlaylistByName is exact-first, case-insensitive fallback", async () => {
    fakeSubsonic.instance.getPlaylists.mockResolvedValue({
      status: "ok",
      playlists: {
        playlist: [
          { id: "1", name: "Workout", songCount: 0, duration: 0 },
          { id: "2", name: "workout", songCount: 0, duration: 0 },
        ],
      },
    });

    const { findPlaylistByName } = await import("../../src/navidrome/playlists.js");
    expect((await findPlaylistByName(config, "workout"))?.id).toBe("2"); // exact
    expect((await findPlaylistByName(config, "WORKOUT"))?.id).toBe("1"); // fallback
    expect(await findPlaylistByName(config, "nope")).toBeNull();
  });

  it("createPlaylist returns the summary on success", async () => {
    fakeSubsonic.instance.createPlaylist.mockResolvedValue({
      status: "ok",
      playlist: { id: "99", name: "Today (2026-05-11)", songCount: 0, duration: 0 },
    });

    const { createPlaylist } = await import("../../src/navidrome/playlists.js");
    const made = await createPlaylist(config, "Today (2026-05-11)");
    expect(made).toMatchObject({ id: "99", name: "Today (2026-05-11)", songCount: 0 });
    expect(fakeSubsonic.instance.createPlaylist).toHaveBeenCalledWith({
      name: "Today (2026-05-11)",
      songId: undefined,
    });
  });

  it("addTracksToPlaylist no-ops when no tracks given", async () => {
    const { addTracksToPlaylist } = await import("../../src/navidrome/playlists.js");
    await addTracksToPlaylist(config, "1", []);
    expect(fakeSubsonic.instance.updatePlaylist).not.toHaveBeenCalled();
  });

  it("addTracksToPlaylist sends songIdToAdd", async () => {
    fakeSubsonic.instance.updatePlaylist.mockResolvedValue({
      status: "ok",
      playlist: { id: "1", name: "X", songCount: 2, duration: 0 },
    });

    const { addTracksToPlaylist } = await import("../../src/navidrome/playlists.js");
    await addTracksToPlaylist(config, "1", ["a", "b"]);
    expect(fakeSubsonic.instance.updatePlaylist).toHaveBeenCalledWith({
      playlistId: "1",
      songIdToAdd: ["a", "b"],
    });
  });

  it("throws when the server returns failed", async () => {
    fakeSubsonic.instance.createPlaylist.mockResolvedValue({
      status: "failed",
      error: { code: 10, message: "auth required" },
    });

    const { createPlaylist } = await import("../../src/navidrome/playlists.js");
    await expect(createPlaylist(config, "X")).rejects.toThrow(/auth required/);
  });
});
