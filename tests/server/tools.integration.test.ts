// Integration test: builds the MCP server with a fake Subsonic, wires a
// pair of in-memory transports to a Client, and exercises the tool
// surface. This is the single best-bang-for-buck test we can write — it
// covers everything from tool registration through schema validation
// through actual Subsonic interaction.

import { describe, expect, it, vi } from "vitest";

const fakeSubsonic = vi.hoisted(() => ({
  instance: {
    getPlaylists: vi.fn(),
    getPlaylist: vi.fn(),
    createPlaylist: vi.fn(),
    updatePlaylist: vi.fn(),
    deletePlaylist: vi.fn(),
    search3: vi.fn(),
    getNowPlaying: vi.fn(),
  },
}));

vi.mock("subsonic-api", () => ({
  default: vi.fn().mockImplementation(() => fakeSubsonic.instance),
}));

import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { buildServer } from "../../src/server/mcp-server.js";

const config = {
  navidrome: { url: "http://test", user: "u", password: "p" },
  library: { root: "/x", downloads_subdir: "Downloads" },
  sources: { default: "youtube" as const, youtube: { audio_quality_kbps: 128, format: "mp3" as const } },
  playlists: { today_rollover_local_time: "00:01", weekly_radio_cron: "0 6 * * 1", weekly_radio_size: 30 },
  history: { scrobble_poll_minutes: 5 },
  transport: { http_port: 4098 },
  log_level: "warn" as const,
};

async function makeClient() {
  const server = buildServer({ name: "test", version: "0.0.0" }, config);
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await server.connect(serverT);

  const client = new Client({ name: "test-client", version: "0.0.0" });
  await client.connect(clientT);

  return { client, server };
}

describe("MCP server integration", () => {
  it("registers the Phase 2 tools and they appear in tools/list", async () => {
    const { client } = await makeClient();
    const result = await client.listTools();
    const names = result.tools.map((t) => t.name).sort();
    expect(names).toContain("music_search");
    expect(names).toContain("playlist_list");
    expect(names).toContain("playlist_get");
    expect(names).toContain("playlist_create");
    expect(names).toContain("playlist_rename");
    expect(names).toContain("playlist_delete");
    expect(names).toContain("playlist_add_tracks");
    expect(names).toContain("playlist_remove_tracks");
    expect(names).toContain("status_now_playing");
  });

  it("music_search invokes search3 and returns hits", async () => {
    const { __resetClient } = await import("../../src/navidrome/client.js");
    __resetClient();
    fakeSubsonic.instance.search3.mockResolvedValue({
      status: "ok",
      searchResult3: {
        song: [{ id: "s1", title: "Holocene", artist: "Bon Iver", duration: 337 }],
      },
    });

    const { client } = await makeClient();
    const result = await client.callTool({ name: "music_search", arguments: { query: "Holocene" } });
    const content = (result.content as Array<{ type: string; text: string }>)[0];
    const parsed = JSON.parse(content.text);
    expect(parsed.count).toBe(1);
    expect(parsed.hits[0]).toMatchObject({ id: "s1", title: "Holocene" });
  });

  it("playlist_create rejects duplicates by name", async () => {
    const { __resetClient } = await import("../../src/navidrome/client.js");
    __resetClient();
    fakeSubsonic.instance.getPlaylists.mockResolvedValue({
      status: "ok",
      playlists: { playlist: [{ id: "1", name: "Workout", songCount: 0, duration: 0 }] },
    });

    const { client } = await makeClient();
    const result = await client.callTool({
      name: "playlist_create",
      arguments: { name: "Workout" },
    });
    const content = (result.content as Array<{ type: string; text: string }>)[0];
    const parsed = JSON.parse(content.text);
    expect(parsed.error).toMatch(/already exists/);
    expect(parsed.existingId).toBe("1");
  });

  it("playlist_add_tracks looks up by name and calls updatePlaylist", async () => {
    const { __resetClient } = await import("../../src/navidrome/client.js");
    __resetClient();
    fakeSubsonic.instance.getPlaylists.mockResolvedValue({
      status: "ok",
      playlists: { playlist: [{ id: "42", name: "Workout", songCount: 0, duration: 0 }] },
    });
    fakeSubsonic.instance.updatePlaylist.mockResolvedValue({
      status: "ok",
      playlist: { id: "42", name: "Workout", songCount: 2, duration: 0 },
    });

    const { client } = await makeClient();
    const result = await client.callTool({
      name: "playlist_add_tracks",
      arguments: { playlist: "Workout", track_ids: ["a", "b"] },
    });
    const content = (result.content as Array<{ type: string; text: string }>)[0];
    const parsed = JSON.parse(content.text);
    expect(parsed.added.count).toBe(2);
    expect(fakeSubsonic.instance.updatePlaylist).toHaveBeenCalledWith({
      playlistId: "42",
      songIdToAdd: ["a", "b"],
    });
  });
});
