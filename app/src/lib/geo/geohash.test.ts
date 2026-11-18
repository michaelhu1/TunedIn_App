import { describe, expect, it } from "vitest";
import { CELL_PATTERN, cellBounds, cellCenter, encodeCell } from "./geohash";

describe("geohash", () => {
  it("matches known reference hashes", () => {
    // Reference values from the original geohash.org examples.
    expect(encodeCell(57.64911, 10.40744, 11)).toBe("u4pruydqqvj");
    expect(encodeCell(42.6, -5.6, 5)).toBe("ezs42");
  });

  it("puts Washington Square Park in a 6-character cell that contains it", () => {
    const lat = 40.7308, lon = -73.9973;
    const cell = encodeCell(lat, lon);
    expect(cell).toMatch(CELL_PATTERN);
    const b = cellBounds(cell);
    expect(lat).toBeGreaterThanOrEqual(b.south);
    expect(lat).toBeLessThanOrEqual(b.north);
    expect(lon).toBeGreaterThanOrEqual(b.west);
    expect(lon).toBeLessThanOrEqual(b.east);
  });

  it("cells are roughly 1.2 km wide and 0.6 km tall in New York", () => {
    const b = cellBounds(encodeCell(40.7308, -73.9973));
    const heightKm = (b.north - b.south) * 111.32;
    const widthKm = (b.east - b.west) * 111.32 * Math.cos((40.73 * Math.PI) / 180);
    expect(heightKm).toBeGreaterThan(0.5);
    expect(heightKm).toBeLessThan(0.7);
    expect(widthKm).toBeGreaterThan(0.8);
    expect(widthKm).toBeLessThan(1.3);
  });

  it("two points a block apart share a cell, so the exact spot is not recoverable", () => {
    expect(encodeCell(40.7308, -73.9973)).toBe(encodeCell(40.7312, -73.9968));
  });

  it("the center re-encodes to the same cell", () => {
    const cell = encodeCell(40.6942, -73.9866); // MetroTech
    const c = cellCenter(cell);
    expect(encodeCell(c.lat, c.lon)).toBe(cell);
  });
});
