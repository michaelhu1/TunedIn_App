import { describe, expect, it } from "vitest";
import { joinNames, matchRead, sharedArtistsSentence } from "./taste-match";

describe("matchRead", () => {
  it("says different taste when nothing is shared", () => {
    expect(matchRead(0, 0)).toMatch(/^Different taste/);
    expect(matchRead(5, 0)).toMatch(/^Different taste/);
  });
  it("does not dress up low scores", () => {
    expect(matchRead(1, 1)).toMatch(/^A little overlap/);
    expect(matchRead(14, 3)).toMatch(/^A little overlap/);
  });
  it("uses the band boundaries", () => {
    expect(matchRead(15, 3)).toBe("Some taste in common.");
    expect(matchRead(39, 3)).toBe("Some taste in common.");
    expect(matchRead(40, 3)).toBe("A lot in common.");
    expect(matchRead(69, 3)).toBe("A lot in common.");
    expect(matchRead(70, 3)).toMatch(/^Very similar taste/);
    expect(matchRead(100, 3)).toMatch(/^Very similar taste/);
  });
});

describe("joinNames", () => {
  it("joins 0 to 4 names", () => {
    expect(joinNames([])).toBe("");
    expect(joinNames(["SZA"])).toBe("SZA");
    expect(joinNames(["SZA", "Frank Ocean"])).toBe("SZA and Frank Ocean");
    expect(joinNames(["SZA", "Frank Ocean", "Tyler, The Creator"])).toBe("SZA, Frank Ocean and Tyler, The Creator");
  });
});

describe("sharedArtistsSentence", () => {
  it("names one, two or three artists", () => {
    expect(sharedArtistsSentence(["SZA"], 1)).toBe("You both play SZA.");
    expect(sharedArtistsSentence(["SZA", "Frank Ocean"], 2)).toBe("You both play SZA and Frank Ocean.");
    expect(sharedArtistsSentence(["SZA", "Frank Ocean", "Tyler, The Creator"], 3)).toBe(
      "You both play SZA, Frank Ocean and Tyler, The Creator.",
    );
  });
  it("adds 'and N more'", () => {
    expect(sharedArtistsSentence(["SZA", "Frank Ocean", "Tyler, The Creator"], 7)).toBe(
      "You both play SZA, Frank Ocean, Tyler, The Creator and 4 more.",
    );
    expect(sharedArtistsSentence(["SZA"], 2)).toBe("You both play SZA and 1 more.");
  });
  it("returns null when nothing is shared", () => {
    expect(sharedArtistsSentence([], 0)).toBeNull();
  });
  it("stays truthful if names are missing", () => {
    expect(sharedArtistsSentence([], 2)).toBe("You both play 2 of the same artists.");
    expect(sharedArtistsSentence(["", "  "], 1)).toBe("You both play 1 of the same artist.");
  });
});
