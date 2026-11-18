import { describe, expect, it } from "vitest";
import { artistsMatch, lookupQuery, normalize, parseTitle, pickBestMatch, type Candidate } from "./match";

describe("normalize", () => {
  it("lowercases, strips accents and punctuation, treats & as and", () => {
    expect(normalize("Beyoncé")).toBe("beyonce");
    expect(normalize("TEXAS HOLD 'EM")).toBe("texas hold em");
    expect(normalize("Simon & Garfunkel")).toBe("simon and garfunkel");
    expect(normalize("Tyler, The Creator")).toBe("tyler the creator");
  });
  it("keeps non-Latin scripts intact", () => {
    expect(normalize("봄날")).toBe("봄날");
    expect(normalize("ガラス")).toBe("ガラス"); // dakuten not stripped
  });
});

describe("parseTitle", () => {
  it("drops features and benign suffixes", () => {
    expect(parseTitle("See You Again (feat. Kali Uchis)").core).toBe("see you again");
    const sun = parseTitle("Here Comes The Sun - Remastered 2009");
    expect(sun.core).toBe("here comes the sun");
    expect(sun.variants.size).toBe(0);
    expect(sun.otherTags).toEqual([]);
    expect(parseTitle("Song feat. Someone").core).toBe("song");
  });
  it("detects different recordings", () => {
    expect([...parseTitle("Spring Day - Live").variants]).toEqual(["live"]);
    expect(parseTitle("Espresso (Mark Ronson x FNZ Working Late Remix)").variants.has("remix")).toBe(true);
    expect(parseTitle("Song (Original Mix)").variants.size).toBe(0);
    expect(parseTitle("Live Forever").variants.size).toBe(0); // "live" in the title itself
  });
  it("leaves hyphenated words alone and keeps bracket alternates", () => {
    expect(parseTitle("Anti-Hero").core).toBe("anti hero");
    expect(parseTitle("봄날 (Spring Day)").alts).toEqual(["spring day"]);
  });
});

describe("artistsMatch", () => {
  it("accepts exact and first-billed matches", () => {
    expect(artistsMatch("The Beatles", "Beatles")).toBe(true);
    expect(artistsMatch("Calvin Harris & Dua Lipa", "Calvin Harris")).toBe(true);
    expect(artistsMatch("Beyonce", "Beyoncé")).toBe(true);
  });
  it("rejects other artists", () => {
    expect(artistsMatch("Sabrina Carpenter", "Vitamin String Quartet")).toBe(false);
  });
});

const pick = (artist: string, title: string, cands: Candidate[]) =>
  pickBestMatch({ artist, title }, cands, (c) => c);

describe("pickBestMatch", () => {
  // Real iTunes order for "sabrina carpenter espresso" (Nov 2026).
  const espresso: Candidate[] = [
    { artist: "Sabrina Carpenter", title: "Espresso (On Vacation Version)" },
    { artist: "Sabrina Carpenter", title: "Espresso", album: "Short n' Sweet", clean: true },
    { artist: "Vitamin String Quartet", title: "Espresso" },
    { artist: "blue toro", title: "Espresso (Piano Version)" },
  ];

  it("prefers the plain studio version over an alternate version", () => {
    expect(pick("Sabrina Carpenter", "Espresso", espresso)?.album).toBe("Short n' Sweet");
  });

  it("rejects live / karaoke / covers, and accepts live only when asked", () => {
    const bts: Candidate[] = [
      { artist: "BTS", title: "Spring Day - Live" },
      { artist: "ZZang KARAOKE", title: "Spring Day (봄날) (Instrumental Karaoke Version)" },
      { artist: "BTS", title: "Spring Day", album: "Proof" },
    ];
    expect(pick("BTS", "봄날 (Spring Day)", bts)?.album).toBe("Proof");
    expect(pick("BTS", "Spring Day (Live)", bts)?.title).toBe("Spring Day - Live");
    expect(pick("BTS", "Spring Day", bts.slice(0, 2))).toBeNull();
  });

  it("matches messy Last.fm titles to clean catalogue titles", () => {
    expect(
      pick("The Beatles", "Here Comes The Sun - Remastered 2009", [
        { artist: "The Beatles", title: "Here Comes the Sun / The Inner Light" },
        { artist: "The Beatles", title: "Here Comes the Sun (Remastered 2009)" },
      ])?.title,
    ).toBe("Here Comes the Sun (Remastered 2009)");
    expect(
      pick("Tyler, The Creator", "See You Again (feat. Kali Uchis)", [
        { artist: "Tyler, The Creator", title: "See You Again (feat. Kali Uchis)" },
      ]),
    ).not.toBeNull();
  });

  it("honours a version named in the query", () => {
    const cands: Candidate[] = [
      { artist: "Taylor Swift", title: "Love Story" },
      { artist: "Taylor Swift", title: "Love Story (Taylor's Version)" },
    ];
    expect(pick("Taylor Swift", "Love Story (Taylor's Version)", cands)?.title).toBe(
      "Love Story (Taylor's Version)",
    );
    expect(pick("Taylor Swift", "Love Story", cands)?.title).toBe("Love Story");
  });

  it("prefers the explicit version on a tie", () => {
    const c = pick("A", "Song", [
      { artist: "A", title: "Song", album: "clean" },
      { artist: "A", title: "Song", album: "dirty", explicit: true },
    ]);
    expect(c?.album).toBe("dirty");
  });

  it("returns null rather than a different song", () => {
    expect(pick("IU", "밤편지", [{ artist: "Flow Music", title: "Through the Night [Piano]" }])).toBeNull();
    expect(pick("Sabrina Carpenter", "Espresso", [{ artist: "Sabrina Carpenter", title: "Please Please Please" }])).toBeNull();
  });
});

describe("lookupQuery", () => {
  it("builds a plain artist + clean title query", () => {
    expect(lookupQuery({ artist: "Beyoncé", title: "TEXAS HOLD 'EM" })).toBe("beyonce texas hold em");
    expect(lookupQuery({ artist: "The Beatles", title: "Here Comes The Sun - Remastered 2009" })).toBe(
      "the beatles here comes the sun",
    );
    expect(lookupQuery({ artist: "BTS", title: "봄날 (Spring Day)" })).toBe("bts 봄날 spring day");
    expect(lookupQuery({ artist: "BTS", title: "Spring Day - Live" })).toBe("bts spring day live");
  });
});
