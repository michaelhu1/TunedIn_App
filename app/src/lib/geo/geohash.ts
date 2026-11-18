// Geohash: a way to name a rectangle on the map with a short string. Each extra character
// makes the rectangle smaller. TunedIn uses 6 characters, a cell of roughly 1.2 km x 0.6 km
// in New York. The phone turns its GPS fix into a cell with `encodeCell` and sends ONLY
// that string, so exact coordinates never leave the device.

const ALPHABET = "0123456789bcdefghjkmnpqrstuvwxyz";
export const CELL_PRECISION = 6;
export const CELL_PATTERN = /^[0123456789bcdefghjkmnpqrstuvwxyz]{6}$/;

export type Bounds = { south: number; west: number; north: number; east: number };

/** Round a position to its cell. */
export function encodeCell(lat: number, lon: number, precision = CELL_PRECISION): string {
  let latRange: [number, number] = [-90, 90];
  let lonRange: [number, number] = [-180, 180];
  let hash = "";
  let bits = 0;
  let value = 0;
  let evenBit = true; // geohash interleaves bits: longitude first, then latitude
  while (hash.length < precision) {
    const range = evenBit ? lonRange : latRange;
    const coord = evenBit ? lon : lat;
    const mid = (range[0] + range[1]) / 2;
    if (coord >= mid) {
      value = value * 2 + 1;
      range[0] = mid;
    } else {
      value = value * 2;
      range[1] = mid;
    }
    evenBit = !evenBit;
    if (++bits === 5) {
      hash += ALPHABET[value];
      bits = 0;
      value = 0;
    }
  }
  return hash;
}

/** The rectangle a cell covers. */
export function cellBounds(cell: string): Bounds {
  const lat: [number, number] = [-90, 90];
  const lon: [number, number] = [-180, 180];
  let evenBit = true;
  for (const ch of cell) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error(`Invalid geohash character: ${ch}`);
    for (let bit = 4; bit >= 0; bit--) {
      const range = evenBit ? lon : lat;
      const mid = (range[0] + range[1]) / 2;
      if ((idx >> bit) & 1) range[0] = mid;
      else range[1] = mid;
      evenBit = !evenBit;
    }
  }
  return { south: lat[0], west: lon[0], north: lat[1], east: lon[1] };
}

/** The middle of a cell: where a friend's pin is drawn. */
export function cellCenter(cell: string): { lat: number; lon: number } {
  const b = cellBounds(cell);
  return { lat: (b.south + b.north) / 2, lon: (b.west + b.east) / 2 };
}
