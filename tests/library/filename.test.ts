import { describe, expect, it } from "vitest";
import { sanitizeFilename } from "../../src/library/filename.js";

describe("library/filename.sanitizeFilename", () => {
  it("collapses spaces and dashes around them", () => {
    expect(sanitizeFilename("Holocene - Bon Iver.mp3")).toBe("Holocene-Bon-Iver.mp3");
  });

  it("replaces all illegal characters", () => {
    expect(sanitizeFilename('a<b>c:"d/e\\f|g?h*i.mp3')).toBe("a-b-c-d-e-f-g-h-i.mp3");
  });

  it("collapses whitespace into single dashes", () => {
    expect(sanitizeFilename("a    b\t\tc.mp3")).toBe("a-b-c.mp3");
  });

  it("preserves the extension dot but trims surrounding dots", () => {
    expect(sanitizeFilename("...track.mp3...")).toBe("track.mp3");
  });

  it("caps length at 200 chars", () => {
    const long = "x".repeat(500) + ".mp3";
    expect(sanitizeFilename(long).length).toBeLessThanOrEqual(200);
  });

  it("falls back to 'untitled' when input collapses to nothing", () => {
    expect(sanitizeFilename("...")).toBe("untitled");
    expect(sanitizeFilename(":::")).toBe("untitled");
  });
});
