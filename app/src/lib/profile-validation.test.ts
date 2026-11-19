import { describe, expect, it } from "vitest";
import {
  charLength,
  classYearOptions,
  cleanText,
  firstFreePosition,
  formatConcertDate,
  normalizeInstagram,
  sortConcerts,
  toggleChoice,
  validateConcert,
  validatePrompt,
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

// The Instagram check from the migration, copied here to prove the editor only produces
// what the database accepts.
const DB_INSTAGRAM = /^[a-z0-9._]{1,30}$/;

describe("normalizeInstagram", () => {
  it("accepts a handle with or without @ and stores it lowercase", () => {
    expect(normalizeInstagram("maya.k")).toEqual({ ok: true, value: "maya.k" });
    expect(normalizeInstagram("  @Maya.K ")).toEqual({ ok: true, value: "maya.k" });
  });

  it("pulls the handle out of a pasted profile link", () => {
    for (const link of [
      "instagram.com/maya_k",
      "https://www.instagram.com/maya_k/",
      "https://instagram.com/Maya_K?igsh=abc",
      "http://m.instagram.com/maya_k/#top",
    ]) {
      expect(normalizeInstagram(link)).toEqual({ ok: true, value: "maya_k" });
    }
  });

  it("stores an empty box as null", () => {
    expect(normalizeInstagram("   ")).toEqual({ ok: true, value: null });
  });

  it("refuses what Instagram (and the database) would not allow", () => {
    for (const bad of ["maya k", "maya-k", "a".repeat(31), "@", "instagram.com/", "https://example.com/maya", "<b>x</b>"]) {
      expect(normalizeInstagram(bad).ok).toBe(false);
    }
  });

  it("only ever returns values the database check accepts", () => {
    for (const input of ["@A.B_c", "instagram.com/X9", "z".repeat(30)]) {
      const r = normalizeInstagram(input);
      expect(r.ok && r.value !== null && DB_INSTAGRAM.test(r.value)).toBe(true);
    }
  });
});

describe("validatePrompt", () => {
  it("stores both columns when a prompt and answer are given", () => {
    expect(validatePrompt("aux", "  Nights - Frank Ocean ")).toEqual({
      ok: true,
      value: { prompt_key: "aux", prompt_answer: "Nights - Frank Ocean" },
    });
  });

  it("stores both as null for No prompt or an empty answer (the database needs the pair)", () => {
    const none = { ok: true, value: { prompt_key: null, prompt_answer: null } };
    expect(validatePrompt("", "something")).toEqual(none);
    expect(validatePrompt("aux", "   ")).toEqual(none);
  });

  it("refuses unknown prompts and long answers", () => {
    expect(validatePrompt("toString", "x").ok).toBe(false);
    expect(validatePrompt("aux", "a".repeat(121)).ok).toBe(false);
    expect(validatePrompt("aux", "🎧".repeat(120)).ok).toBe(true);
  });
});

describe("toggleChoice", () => {
  const all = ["a", "b", "c", "d"] as const;
  type K = (typeof all)[number];

  it("adds and removes, keeping the option list's order", () => {
    expect(toggleChoice<K>(["c"], "a", all)).toEqual(["a", "c"]);
    expect(toggleChoice<K>(["a", "c"], "a", all)).toEqual(["c"]);
  });

  it("does not add past the maximum, but still removes", () => {
    expect(toggleChoice<K>(["a", "b"], "c", all, 2)).toEqual(["a", "b"]);
    expect(toggleChoice<K>(["a", "b"], "b", all, 2)).toEqual(["a"]);
  });
});

describe("validateConcert", () => {
  const base = { status: "going", artist: "Mitski", venue: "", date: "" };

  it("needs only a status and an artist", () => {
    expect(validateConcert(base)).toEqual({
      ok: true,
      value: { status: "going", artist: "Mitski", venue: null, event_date: null },
    });
  });

  it("trims and keeps an optional venue and date", () => {
    expect(validateConcert({ status: "went", artist: " Mitski ", venue: " Kings Theatre ", date: "2024-03-14" })).toEqual({
      ok: true,
      value: { status: "went", artist: "Mitski", venue: "Kings Theatre", event_date: "2024-03-14" },
    });
  });

  it("refuses a missing artist, long text, bad status and impossible dates", () => {
    expect(validateConcert({ ...base, artist: "  " }).ok).toBe(false);
    expect(validateConcert({ ...base, artist: "a".repeat(81) }).ok).toBe(false);
    expect(validateConcert({ ...base, venue: "a".repeat(81) }).ok).toBe(false);
    expect(validateConcert({ ...base, status: "maybe" }).ok).toBe(false);
    expect(validateConcert({ ...base, date: "2026-02-30" }).ok).toBe(false);
    expect(validateConcert({ ...base, date: "1989-12-31" }).ok).toBe(false);
    expect(validateConcert({ ...base, date: "2041-01-01" }).ok).toBe(false);
    expect(validateConcert({ ...base, date: "03/14/2026" }).ok).toBe(false);
    expect(validateConcert({ ...base, date: "2040-12-31" }).ok).toBe(true);
  });
});

describe("sortConcerts", () => {
  it("shows upcoming soonest first, then past most recent first, undated last in each", () => {
    const list = [
      { position: 1, status: "went" as const, eventDate: "2023-05-01" },
      { position: 2, status: "going" as const, eventDate: null },
      { position: 3, status: "went" as const, eventDate: null },
      { position: 4, status: "going" as const, eventDate: "2027-01-10" },
      { position: 5, status: "went" as const, eventDate: "2025-09-20" },
      { position: 6, status: "going" as const, eventDate: "2026-12-01" },
    ];
    expect(sortConcerts(list).map((c) => c.position)).toEqual([6, 4, 2, 5, 1, 3]);
  });
});

describe("formatConcertDate", () => {
  it("formats without shifting the day across time zones", () => {
    expect(formatConcertDate("2026-03-01")).toBe("Mar 1, 2026");
    expect(formatConcertDate("2025-12-31")).toBe("Dec 31, 2025");
  });
});
