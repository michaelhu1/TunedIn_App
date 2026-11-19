import { describe, expect, it } from "vitest";
import { matchLabel, reasonsFor, type Suggestion } from "./reasons";

const base: Suggestion = {
  user_id: "u", handle: "maya", display_name: null, avatar_url: null, school: "Tandon",
  class_year: null, student_status: null, prompt_key: null, prompt_answer: null,
  open_to: ["concert_buddies"], taste_score: null, shared_artists: [], shared_open_to: [],
  shared_genres: [], shared_concert: null, both_new: false, same_school: false,
};

describe("reasonsFor", () => {
  it("puts the strongest reasons first and stops at three", () => {
    const r = reasonsFor({
      ...base,
      shared_concert: "Tame Impala",
      shared_artists: ["SZA", "Frank Ocean"],
      shared_open_to: ["concert_buddies", "new_friends"],
      shared_genres: ["pop"],
      both_new: true,
      same_school: true,
    });
    expect(r).toEqual([
      "You are both going to Tame Impala",
      "You both play SZA and Frank Ocean",
      "Both open to concert buddies and meeting new people",
    ]);
  });

  it("falls back to what they are open to when nothing is shared", () => {
    expect(reasonsFor(base)).toEqual(["Open to concert buddies"]);
  });

  it("ignores keys and genres that are not on the lists", () => {
    expect(reasonsFor({ ...base, shared_open_to: ["hacking"], shared_genres: ["made-up"], same_school: true })).toEqual([
      "Also in Tandon",
    ]);
  });
});

describe("shared favourite artists", () => {
  it("are the reason when there are no plays to compare", () => {
    expect(reasonsFor({ ...base, shared_favorites: ["SZA", "Frank Ocean"] })).toEqual(["You both like SZA and Frank Ocean"]);
  });
  it("give way to artists both people actually play", () => {
    const r = reasonsFor({ ...base, shared_artists: ["SZA"], shared_favorites: ["Frank Ocean"] });
    expect(r).toEqual(["You both play SZA"]);
  });
});

describe("matchLabel", () => {
  it("shows a score only when there is one", () => {
    expect(matchLabel({ ...base, taste_score: 64 })).toBe("64% match");
    expect(matchLabel({ ...base, taste_score: 0 })).toBeNull();
    expect(matchLabel(base)).toBeNull();
  });
});
