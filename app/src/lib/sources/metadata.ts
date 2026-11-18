// Combines several MetadataSources into one, tried in order (Deezer, then iTunes).
// We stop at the first useful answer instead of asking every source every time:
// iTunes allows only about 20 requests a minute, so it should only see Deezer's misses.

import { SourceError, type MetadataSource, type TrackMetadata } from "./types";

export function createMetadataSource(sources: MetadataSource[]): MetadataSource {
  /**
   * Run `call` on each source until `accept` likes the answer. A SourceError moves on
   * to the next source; any other exception is a bug and is rethrown. If every source
   * threw, the first error is rethrown so the caller can back off.
   *
   * `strict` (used by lookup) also rethrows when ANY source failed and none found the
   * song. Otherwise a brief outage would be recorded as "this song does not exist",
   * and that answer gets cached.
   */
  async function firstUseful<T>(
    call: (s: MetadataSource) => Promise<T>,
    accept: (v: T) => boolean,
    empty: T,
    strict = false,
  ): Promise<T> {
    const errors: SourceError[] = [];
    for (const source of sources) {
      try {
        const value = await call(source);
        if (accept(value)) return value;
      } catch (e) {
        if (!(e instanceof SourceError)) throw e;
        errors.push(e);
      }
    }
    if (errors.length > 0 && (strict || errors.length === sources.length)) throw errors[0];
    return empty;
  }

  return {
    id: sources.map((s) => s.id).join("+"),

    search(query, limit) {
      return firstUseful<TrackMetadata[]>((s) => s.search(query, limit), (r) => r.length > 0, []);
    },

    lookup(ref) {
      return firstUseful<TrackMetadata | null>((s) => s.lookup(ref), (r) => r !== null, null, true);
    },
  };
}
