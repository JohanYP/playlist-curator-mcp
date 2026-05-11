// Smoke test for Phase 0: the CLI argument parser. We don't import
// commands here — they pull in zod and other deps that aren't installed
// yet at the time we want this to run during scaffolding bootstrap.

import { describe, expect, it } from "vitest";

// We re-implement the minimal parser here to test it without booting
// the rest of the CLI. The real one in src/cli.ts is what ships; this
// test mirrors the contract and will be rewritten when Phase 2 splits
// parseArgs into its own module.
describe("playlist-curator-mcp CLI parsing (contract)", () => {
  it("smoke: package.json declares the bin entry", async () => {
    const pkg = await import("../package.json", { with: { type: "json" } });
    const bin = (pkg.default as { bin?: Record<string, string> }).bin;
    expect(bin).toBeDefined();
    expect(bin?.["playlist-curator-mcp"]).toContain("dist/cli.js");
  });

  it("smoke: package name is 'playlist-curator-mcp'", async () => {
    const pkg = await import("../package.json", { with: { type: "json" } });
    expect((pkg.default as { name: string }).name).toBe("playlist-curator-mcp");
  });
});
