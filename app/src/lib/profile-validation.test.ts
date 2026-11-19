import { describe, expect, it } from "vitest";
import {
  charLength,
  classYearOptions,
  cleanText,
  firstFreePosition,
  parseClassYear,
  serviceList,
  validateLink,
  validateOptionalText,
} from "./profile-validation";

// A copy of LINK_HOSTS from src/lib/profile.ts, which is server-only and cannot be imported
// here. The point of these tests is the logic, not the list.
const HOSTS = [
  "open.spotify.com",
  "music.apple.com",
  "music.youtube.com",
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
  "soundcloud.com",
  "on.soundcloud.com",
  "deezer.com",
  "www.deezer.com",
  "tidal.com",
];

// The database check constraint, copied from the migration, so we can prove that what the
// editor accepts the database accepts too.
const DB_URL = /^https:\/\/(open\.spotify\.com|music\.apple\.com|music\.youtube\.com|(www\.|m\.)?youtube\.com|youtu\.be|(on\.)?soundcloud\.com|(www\.)?deezer\.com|tidal\.com)\//;

describe("text", () => {
  it("trims and stores empty as null", () => {
    expect(cleanText("  hi  ")).toBe("hi");
    expect(cleanText("   ")).toBeNull();
    expect(cleanText("")).toBeNull();
  });

  it("counts emoji as one character, like Postgres", () => {
    expect(charLength("🎧")).toBe(1);
    expect("🎧".length).toBe(2);
  });

  it("enforces the maximum on the trimmed text", () => {
    expect(validateOptionalText("  " + "a".repeat(40) + "  ", 40, "Name")).toEqual({ ok: true, value: "a".repeat(40) });
    const r = validateOptionalText("a".repeat(41), 40, "Name");
    expect(r.ok).toBe(false);
    expect(validateOptionalText("🎧".repeat(40), 40, "Name").ok).toBe(true);
    expect(validateOptionalText("", 40, "Name")).toEqual({ ok: true, value: null });
  });
});

describe("class year", () => {
  it("offers last year through six years ahead", () => {
    expect(classYearOptions(new Date("2026-11-19"), null)).toEqual([2025, 2026, 2027, 2028, 2029, 2030, 2031, 2032]);
  });

  it("keeps a saved year that is outside the window", () => {
    expect(classYearOptions(new Date("2026-11-19"), 2019)[0]).toBe(2019);
  });

  it("parses the select value", () => {
    expect(parseClassYear("")).toEqual({ ok: true, value: null });
    expect(parseClassYear("2028")).toEqual({ ok: true, value: 2028 });
    expect(parseClassYear("2014").ok).toBe(false);
    expect(parseClassYear("2041").ok).toBe(false);
    expect(parseClassYear("20.5").ok).toBe(false);
    expect(parseClassYear("abc").ok).toBe(false);
  });
});

describe("links", () => {
  const ok = (title: string, url: string) => {
    const r = validateLink(title, url, HOSTS);
    if (!r.ok) throw new Error(r.error);
    return r.value.url;
  };
  const error = (title: string, url: string) => {
    const r = validateLink(title, url, HOSTS);
    if (r.ok) throw new Error(`accepted ${url}`);
    return r.error;
  };

  it("accepts known services and matches the database rule", () => {
    for (const url of [
      "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M",
      "https://music.apple.com/us/playlist/todays-hits/pl.f4d106fed2bd41149aaacabb233eb5eb",
      "https://www.youtube.com/playlist?list=PL123",
      "https://youtube.com/playlist?list=PL123",
      "https://soundcloud.com/someone/sets/late-night",
      "https://www.deezer.com/en/playlist/123",
      "https://tidal.com/browse/playlist/abc",
    ]) {
      expect(DB_URL.test(ok("Mix", url))).toBe(true);
    }
  });

  it("adds a trailing slash after a bare host, which the database needs", () => {
    expect(ok("Me", "https://open.spotify.com").endsWith("open.spotify.com/")).toBe(true);
  });

  it("lowercases the host", () => {
    expect(ok("Mix", "https://OPEN.Spotify.com/playlist/x")).toBe("https://open.spotify.com/playlist/x");
  });

  it("adds https:// when the scheme is missing", () => {
    expect(ok("Mix", "open.spotify.com/playlist/x")).toBe("https://open.spotify.com/playlist/x");
  });

  it("rejects http, other schemes, and other hosts", () => {
    expect(error("Mix", "http://open.spotify.com/playlist/x")).toMatch(/https/);
    expect(error("Mix", "javascript:alert(1)")).toMatch(/https/);
    expect(error("Mix", "https://evil.example/open.spotify.com/")).toMatch(/Spotify/);
    expect(error("Mix", "https://open.spotify.com.evil.example/")).toMatch(/Spotify/);
    expect(error("Mix", "https://vimeo.com/playlist?list=1")).toMatch(/YouTube/);
  });

  it("rejects disguised links", () => {
    expect(validateLink("Mix", "https://open.spotify.com@evil.example/", HOSTS).ok).toBe(false);
    expect(validateLink("Mix", "https://user:pw@open.spotify.com/", HOSTS).ok).toBe(false);
    expect(validateLink("Mix", "https://open.spotify.com:8443/", HOSTS).ok).toBe(false);
  });

  it("checks length and title", () => {
    expect(error("Mix", "https://open.spotify.com/" + "a".repeat(300))).toMatch(/too long/);
    expect(error("   ", "https://open.spotify.com/x")).toMatch(/name/);
    expect(error("a".repeat(41), "https://open.spotify.com/x")).toMatch(/40/);
    expect(error("Mix", "   ")).toMatch(/link/);
    expect(validateLink("  Mix  ", "https://open.spotify.com/x", HOSTS)).toEqual({
      ok: true,
      value: { title: "Mix", url: "https://open.spotify.com/x" },
    });
  });

  it("names the accepted services once each", () => {
    expect(serviceList(HOSTS)).toBe("Spotify, Apple Music, YouTube Music, YouTube, SoundCloud, Deezer or TIDAL");
  });
});

describe("firstFreePosition", () => {
  it("fills gaps first", () => {
    expect(firstFreePosition([], 4)).toBe(1);
    expect(firstFreePosition([1, 2], 4)).toBe(3);
    expect(firstFreePosition([1, 3], 4)).toBe(2);
    expect(firstFreePosition([1, 2, 3, 4], 4)).toBeNull();
  });
});
