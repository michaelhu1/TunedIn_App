// The fixed choices on a profile: prompts, genre tags, "open to" chips, music-making roles
// and the first-year / transfer badge. Picking from lists (instead of free text) keeps
// profiles comparable, so people can be matched on them later, and leaves less to moderate.
//
// This file has no server-only code, so both the editor (browser) and the pages (server)
// import it. The database has matching check constraints in
// supabase/migrations/*_profile_connection.sql; if you change a list here, change it there.

export const PROMPTS = {
  finals_song: "The song that got me through finals",
  no_skips: "An album with no skips",
  aux: "Hand me the aux and I will play",
  first_concert: "My first concert was",
  hot_take: "My hottest music take",
  always_gets_me: "A song that always gets me",
  nyc_song: "My New York song",
  ask_me: "Ask me about",
} as const;
export type PromptKey = keyof typeof PROMPTS;
export const PROMPT_ANSWER_MAX = 120;

export const GENRES = [
  "pop", "hip-hop", "r&b", "indie", "rock", "alternative", "electronic", "house", "techno",
  "k-pop", "j-pop", "c-pop", "latin", "reggaeton", "afrobeats", "dancehall", "bollywood",
  "jazz", "soul", "classical", "country", "folk", "metal", "punk", "emo", "lo-fi",
  "ambient", "musical theatre",
] as const;
export const MAX_GENRES = 5;

export const OPEN_TO = {
  concert_buddies: "Concert buddies",
  playlist_swaps: "Playlist swaps",
  recommendations: "Song recommendations",
  jamming: "People to jam with",
  study_playlists: "Study playlists",
  new_friends: "Meeting new people",
} as const;
export type OpenToKey = keyof typeof OPEN_TO;

export const MUSIC_ROLES = {
  sing: "Sing",
  guitar: "Guitar",
  bass: "Bass",
  drums: "Drums",
  keys: "Keys",
  strings: "Strings",
  horns: "Horns / winds",
  produce: "Produce",
  dj: "DJ",
  songwriting: "Write songs",
  band: "In a band",
  radio: "College radio",
} as const;
export type MusicRoleKey = keyof typeof MUSIC_ROLES;
export const MUSIC_NOTE_MAX = 60;

export const STUDENT_STATUS = {
  first_year: "First-year",
  transfer: "Transfer",
} as const;
export type StudentStatusKey = keyof typeof STUDENT_STATUS;

export const PRONOUNS_MAX = 20;
export const MAJOR_MAX = 60;
export const HOMETOWN_MAX = 60;
/** Instagram's own rule: letters, numbers, dots and underscores, up to 30. Stored lowercase without "@". */
export const INSTAGRAM_PATTERN = /^[a-z0-9._]{1,30}$/;

export const MAX_CONCERTS = 6;
export const CONCERT_TEXT_MAX = 80;
export const CONCERT_STATUS = { going: "Going to", went: "Went to" } as const;
export type ConcertStatusKey = keyof typeof CONCERT_STATUS;
