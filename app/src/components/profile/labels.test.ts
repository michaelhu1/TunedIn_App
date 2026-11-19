import { describe, expect, it } from "vitest";
import { MUSIC_ROLES, OPEN_TO, PROMPTS } from "../../lib/profile-options";
import { instagramUrl, knownGenres, labelFor, labelsFor } from "./labels";

describe("labelsFor", () => {
  it("maps keys to labels in order and skips unknown ones", () => {
    expect(labelsFor(["playlist_swaps", "nope", "concert_buddies"], OPEN_TO)).toEqual(["Playlist swaps", "Concert buddies"]);
    expect(labelsFor(["bass", "produce"], MUSIC_ROLES)).toEqual(["Bass", "Produce"]);
  });
  it("is not fooled by built-in object properties", () => {
    expect(labelsFor(["toString", "constructor", "__proto__"], OPEN_TO)).toEqual([]);
  });
});

describe("labelFor", () => {
  it("returns the label or null", () => {
    expect(labelFor("hot_take", PROMPTS)).toBe("My hottest music take");
    expect(labelFor("gone", PROMPTS)).toBeNull();
    expect(labelFor(null, PROMPTS)).toBeNull();
    expect(labelFor("toString", PROMPTS)).toBeNull();
  });
});

describe("knownGenres", () => {
  it("drops tags not on the list", () => {
    expect(knownGenres(["r&b", "vaporwave", "k-pop"])).toEqual(["r&b", "k-pop"]);
  });
});

describe("instagramUrl", () => {
  it("builds the profile URL for a valid handle", () => {
    expect(instagramUrl("nyu.music_fan")).toBe("https://www.instagram.com/nyu.music_fan/");
  });
  it("refuses anything that is not a plain handle", () => {
    expect(instagramUrl(null)).toBeNull();
    expect(instagramUrl("")).toBeNull();
    expect(instagramUrl("@someone")).toBeNull();
    expect(instagramUrl("Someone")).toBeNull(); // stored lowercase, so uppercase means a bad row
    expect(instagramUrl("a/../../evil")).toBeNull();
    expect(instagramUrl("evil.com?x=1")).toBeNull();
    expect(instagramUrl("a".repeat(31))).toBeNull();
  });
});
