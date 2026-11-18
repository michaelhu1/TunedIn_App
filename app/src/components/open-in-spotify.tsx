// A link that opens a song on Spotify (the app, on a phone that has it).
// `compact` is the small round version used in tight rows.
export default function OpenInSpotify({ trackId, compact = false }: { trackId: string; compact?: boolean }) {
  const href = `/api/open/spotify?trackId=${trackId}`;
  return compact ? (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label="Open in Spotify"
      title="Open in Spotify"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-foreground/20 text-sm"
    >
      ↗
    </a>
  ) : (
    <a href={href} target="_blank" rel="noreferrer" className="underline">
      Open in Spotify
    </a>
  );
}
