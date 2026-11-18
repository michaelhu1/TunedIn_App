// The one shape every music source speaks. The rest of the app only knows these types,
// so adding ListenBrainz or Apple Music later means writing one more adapter, not
// touching charts, the map, or the poller.

/** The minimum that identifies a song. Last.fm gives us only this. */
export type TrackRef = {
  artist: string;
  title: string;
  album?: string;
};

/** A song with everything we can show: art, a 30-second preview, and outbound ids. */
export type TrackMetadata = TrackRef & {
  isrc?: string;
  artworkUrl?: string;
  previewUrl?: string;
  durationMs?: number;
  deezerId?: number;
  itunesId?: number;
  spotifyId?: string;
};

/** One listen reported by a listening source. */
export type Listen = {
  track: TrackRef;
  /** When it was played. Null only while `nowPlaying` is true (it has not finished yet). */
  playedAt: Date | null;
  nowPlaying: boolean;
  /** Art from the listening source, if any. Used only as a fallback. */
  artworkUrl?: string;
};

export type SourceErrorKind =
  | "not_found" // the user or track does not exist
  | "private" // the user exists but hides their listening
  | "rate_limited" // back off and retry later
  | "unavailable"; // network failure, 5xx, bad response

export class SourceError extends Error {
  constructor(
    public readonly kind: SourceErrorKind,
    message: string,
    public readonly source: string,
  ) {
    super(message);
    this.name = "SourceError";
  }
}

/** Where listening history comes from (Last.fm today). */
export interface ListeningSource {
  readonly id: string;
  /**
   * Most recent listens, newest first. If a track is playing right now it comes first
   * with `nowPlaying: true`. `since` limits results to plays after that time.
   * Throws SourceError.
   */
  getRecentListens(username: string, opts?: { limit?: number; since?: Date }): Promise<Listen[]>;
  /** True if the username exists. Throws SourceError only for rate_limited/unavailable. */
  userExists(username: string): Promise<boolean>;
}

/** Where song details come from (Deezer first, iTunes as fallback). */
export interface MetadataSource {
  readonly id: string;
  /** Free-text search for the check-in screen. Best matches first. Throws SourceError. */
  search(query: string, limit?: number): Promise<TrackMetadata[]>;
  /**
   * Find the best match for an artist + title, or null if nothing matches well enough.
   * Must not return a different song just because it was the top result.
   * Throws SourceError only for rate_limited/unavailable.
   */
  lookup(ref: TrackRef): Promise<TrackMetadata | null>;
}
