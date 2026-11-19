import { describe, expect, it } from "vitest";
import { emojiForMajor, flagForHometown } from "./profile-emoji";

describe("flagForHometown", () => {
  it.each([
    ["Queens, NY", "🇺🇸"],
    ["Hong Kong", "🇭🇰"],
    ["Lagos, Nigeria", "🇳🇬"],
    ["Seoul", "🇰🇷"],
    ["Atlanta, Georgia", "🇺🇸"],
    ["Tbilisi, Georgia", "🇺🇸"], // known limit: the state wins; see the comment in the code
    ["São Paulo, Brazil", "🇧🇷"],
    ["London, UK", "🇬🇧"],
    ["Toronto, Canada", "🇨🇦"],
    ["Los Angeles, CA", "🇺🇸"],
  ])("%s", (input, expected) => expect(flagForHometown(input)).toBe(expected));

  it("shows nothing when unsure", () => {
    expect(flagForHometown("the internet")).toBeNull();
    expect(flagForHometown("in a van")).toBeNull();
    expect(flagForHometown(null)).toBeNull();
  });
});

describe("emojiForMajor", () => {
  it.each([
    ["Computer Science", "💻"],
    ["Music Technology", "🎧"],
    ["Music Business", "🎧"],
    ["Film & TV", "🎬"],
    ["Economics", "📈"],
    ["Finance", "💼"],
    ["Biology", "🧬"],
    ["Psychology", "🧠"],
  ])("%s", (input, expected) => expect(emojiForMajor(input)).toBe(expected));

  it("shows nothing when nothing fits", () => {
    expect(emojiForMajor("Vibes")).toBeNull();
    expect(emojiForMajor(null)).toBeNull();
  });
});
