// Which music service a playlist link points to, from its host name. Returns null for
// anything we do not recognise, and the page then leaves the link out. The database
// already refuses other hosts (see LINK_HOSTS in src/lib/profile.ts); this is a second
// guard so a bad row can never become a link to somewhere unexpected.
const SERVICES: Record<string, string> = {
  "open.spotify.com": "Spotify",
  "music.apple.com": "Apple Music",
  "music.youtube.com": "YouTube",
  "youtube.com": "YouTube",
  "www.youtube.com": "YouTube",
  "m.youtube.com": "YouTube",
  "youtu.be": "YouTube",
  "soundcloud.com": "SoundCloud",
  "on.soundcloud.com": "SoundCloud",
  "deezer.com": "Deezer",
  "www.deezer.com": "Deezer",
  "tidal.com": "TIDAL",
};

export function serviceName(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return null;
    return SERVICES[u.hostname] ?? null;
  } catch {
    return null; // not a URL at all
  }
}
