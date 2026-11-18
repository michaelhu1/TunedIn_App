import "server-only";
import { createDeezerSource } from "./deezer";
import { createItunesSource } from "./itunes";
import { createLastfmSource } from "./lastfm";
import { createMetadataSource } from "./metadata";
import type { ListeningSource, MetadataSource } from "./types";

// The app asks for "the metadata source" and "the listening source" and never
// names a provider. Swapping or adding providers happens here only.

let metadata: MetadataSource | undefined;
let listening: ListeningSource | undefined;

/** Deezer first (no key, has previews), iTunes as the fallback. */
export function getMetadataSource(): MetadataSource {
  metadata ??= createMetadataSource([createDeezerSource(), createItunesSource()]);
  return metadata;
}

export function getListeningSource(): ListeningSource {
  const apiKey = process.env.LASTFM_API_KEY;
  if (!apiKey) throw new Error("LASTFM_API_KEY is not set. See app/.env.example.");
  listening ??= createLastfmSource({ apiKey });
  return listening;
}
