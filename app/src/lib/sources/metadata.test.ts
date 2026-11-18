import { describe, expect, it, vi } from "vitest";
import { createMetadataSource } from "./metadata";
import { SourceError, type MetadataSource, type TrackMetadata } from "./types";

const song: TrackMetadata = { artist: "A", title: "Song" };

function fake(id: string, impl: { search?: () => Promise<TrackMetadata[]>; lookup?: () => Promise<TrackMetadata | null> }) {
  return {
    id,
    search: vi.fn(impl.search ?? (async () => [])),
    lookup: vi.fn(impl.lookup ?? (async () => null)),
  } satisfies MetadataSource;
}
const fail = (kind: "rate_limited" | "unavailable") => async () => {
  throw new SourceError(kind, "boom", "x");
};

describe("createMetadataSource lookup", () => {
  it("stops at the first match and never calls later sources", async () => {
    const a = fake("deezer", { lookup: async () => song });
    const b = fake("itunes", {});
    expect(await createMetadataSource([a, b]).lookup({ artist: "A", title: "Song" })).toBe(song);
    expect(b.lookup).not.toHaveBeenCalled();
  });
  it("falls through on null and on SourceError", async () => {
    const m = createMetadataSource([fake("a", {}), fake("b", { lookup: fail("rate_limited") }), fake("c", { lookup: async () => song })]);
    expect(await m.lookup({ artist: "A", title: "Song" })).toBe(song);
  });
  it("returns null only when every source answered; a failure plus a miss throws", async () => {
    expect(await createMetadataSource([fake("a", {}), fake("b", {})]).lookup(song)).toBeNull();
    // A miss must not be cached as "no such song" while one source was down.
    await expect(
      createMetadataSource([fake("a", { lookup: fail("unavailable") }), fake("b", {})]).lookup(song),
    ).rejects.toMatchObject({ kind: "unavailable" });
    await expect(
      createMetadataSource([fake("a", { lookup: fail("rate_limited") }), fake("b", { lookup: fail("unavailable") })]).lookup(song),
    ).rejects.toMatchObject({ kind: "rate_limited" });
  });
  it("rethrows bugs that are not SourceErrors", async () => {
    const m = createMetadataSource([fake("a", { lookup: async () => { throw new TypeError("bug"); } }), fake("b", {})]);
    await expect(m.lookup(song)).rejects.toBeInstanceOf(TypeError);
  });
});

describe("createMetadataSource search", () => {
  it("uses the first source with results, skipping errors and empties", async () => {
    const c = fake("c", { search: async () => [song] });
    const m = createMetadataSource([fake("a", { search: fail("unavailable") }), fake("b", {}), c]);
    expect(await m.search("q", 5)).toEqual([song]);
    expect(c.search).toHaveBeenCalledWith("q", 5);
    expect(m.id).toBe("a+b+c");
  });
  it("returns [] when every source is empty", async () => {
    expect(await createMetadataSource([fake("a", {})]).search("q")).toEqual([]);
  });
});
