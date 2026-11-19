import { describe, expect, it } from "vitest";
import type { ProfileConcert } from "@/lib/profile";
import { formatConcertDate, groupConcerts, parseYmd, todayYmd } from "./concerts";

const TODAY = "2026-11-19";

let pos = 0;
const concert = (status: ProfileConcert["status"], artist: string, eventDate: string | null): ProfileConcert => ({
  position: pos++,
  status,
  artist,
  venue: null,
  eventDate,
});

describe("parseYmd", () => {
  it("reads real dates", () => {
    expect(parseYmd("2026-12-05")).toEqual({ year: 2026, month: 12, day: 5 });
    expect(parseYmd("2024-02-29")).toEqual({ year: 2024, month: 2, day: 29 });
  });
  it("refuses anything else", () => {
    expect(parseYmd(null)).toBeNull();
    expect(parseYmd("")).toBeNull();
    expect(parseYmd("2026-02-30")).toBeNull();
    expect(parseYmd("2025-02-29")).toBeNull();
    expect(parseYmd("2026-13-01")).toBeNull();
    expect(parseYmd("2026-12-05T10:00:00Z")).toBeNull();
    expect(parseYmd("Dec 5")).toBeNull();
  });
});

describe("todayYmd", () => {
  it("uses New York's date, not UTC's", () => {
    // 02:00 UTC on Nov 20 is still 21:00 on Nov 19 in New York.
    expect(todayYmd(new Date("2026-11-20T02:00:00Z"))).toBe("2026-11-19");
    expect(todayYmd(new Date("2026-11-20T06:00:00Z"))).toBe("2026-11-20");
  });
});

describe("formatConcertDate", () => {
  it("shows weekday and day for this year, without timezone shifts", () => {
    // Dec 5 2026 is a Saturday. new Date("2026-12-05") read with local getters in New York
    // would say Fri, Dec 4; this must not.
    expect(formatConcertDate("2026-12-05", TODAY)).toBe("Sat, Dec 5");
    expect(formatConcertDate("2026-01-01", TODAY)).toBe("Thu, Jan 1");
  });
  it("shows month and year for past years", () => {
    expect(formatConcertDate("2024-12-31", TODAY)).toBe("Dec 2024");
    expect(formatConcertDate("2025-06-01", TODAY)).toBe("Jun 2025");
  });
  it("keeps the day for upcoming dates in a later year", () => {
    expect(formatConcertDate("2027-01-09", TODAY)).toBe("Sat, Jan 9, 2027");
  });
  it("returns null without a usable date", () => {
    expect(formatConcertDate(null, TODAY)).toBeNull();
    expect(formatConcertDate("2026-02-30", TODAY)).toBeNull();
  });
});

describe("groupConcerts", () => {
  it("sorts going soonest first with undated last", () => {
    const { going, went } = groupConcerts(
      [concert("going", "Undated", null), concert("going", "Later", "2027-03-01"), concert("going", "Soon", "2026-11-25")],
      TODAY,
    );
    expect(going.map((c) => c.artist)).toEqual(["Soon", "Later", "Undated"]);
    expect(went).toEqual([]);
  });

  it("sorts went most recent first with undated last", () => {
    const { went } = groupConcerts(
      [concert("went", "Undated", null), concert("went", "Old", "2023-05-01"), concert("went", "Recent", "2026-10-01")],
      TODAY,
    );
    expect(went.map((c) => c.artist)).toEqual(["Recent", "Old", "Undated"]);
  });

  it("moves past 'going' concerts to went, but keeps today's", () => {
    const { going, went } = groupConcerts(
      [concert("going", "Yesterday", "2026-11-18"), concert("going", "Tonight", TODAY), concert("went", "Last month", "2026-10-19")],
      TODAY,
    );
    expect(going.map((c) => c.artist)).toEqual(["Tonight"]);
    expect(went.map((c) => c.artist)).toEqual(["Yesterday", "Last month"]);
  });

  it("keeps the person's order on ties and treats bad dates as undated", () => {
    const { going } = groupConcerts(
      [concert("going", "A", null), concert("going", "Bad", "2026-02-30"), concert("going", "B", null)],
      TODAY,
    );
    expect(going.map((c) => c.artist)).toEqual(["A", "Bad", "B"]);
  });

  it("skips unknown statuses", () => {
    const odd = { ...concert("going", "Odd", null), status: "maybe" } as unknown as ProfileConcert;
    expect(groupConcerts([odd], TODAY)).toEqual({ going: [], went: [] });
  });
});
