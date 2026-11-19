import { describe, expect, it } from "vitest";
import { listeningDay, windowStartDay } from "./listening-day";

describe("listeningDay", () => {
  it("counts 3am in New York as the day before", () => {
    expect(listeningDay("2026-11-19T08:30:00Z")).toBe("2026-11-18"); // 3:30am EST
    expect(listeningDay("2026-11-19T09:30:00Z")).toBe("2026-11-19"); // 4:30am EST
  });
});

describe("listeningDay on the days the clocks change", () => {
  it("matches the database when the clocks go back (1 Nov 2026)", () => {
    expect(listeningDay("2026-11-01T08:30:00Z")).toBe("2026-10-31"); // 3:30am EST, before 4am
    expect(listeningDay("2026-11-01T09:30:00Z")).toBe("2026-11-01"); // 4:30am EST
  });
  it("matches the database when the clocks go forward (14 Mar 2027)", () => {
    expect(listeningDay("2027-03-14T08:30:00Z")).toBe("2027-03-14"); // 4:30am EDT
    expect(listeningDay("2027-03-14T06:30:00Z")).toBe("2027-03-13"); // 1:30am EST
  });
});

describe("windowStartDay", () => {
  it("makes a week exactly seven days, however late in the day it is", () => {
    const now = new Date("2026-11-19T23:00:00Z"); // 6pm in New York on the 19th
    expect(windowStartDay(7, now)).toBe("2026-11-13");
    // 13,14,15,16,17,18,19 = seven days; a play from the evening of the 12th is outside.
    expect(listeningDay("2026-11-13T02:00:00Z") >= windowStartDay(7, now)).toBe(false);
    expect(listeningDay("2026-11-13T12:00:00Z") >= windowStartDay(7, now)).toBe(true);
  });
  it("crosses a month boundary", () => {
    expect(windowStartDay(7, new Date("2026-12-02T18:00:00Z"))).toBe("2026-11-26");
  });
});
