// Turns one suggestion from people_you_might_click_with() into the short lines shown on its
// card: WHY this person is suggested. Pure functions; see reasons.test.ts.
//
// Relative imports (not "@/") so the unit tests can load this file without path aliases.
import { OPEN_TO } from "../../lib/profile-options";
import { joinNames } from "../profile/taste-match";
import { knownGenres, labelsFor } from "../profile/labels";

export type Suggestion = {
  user_id: string;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
  school: string;
  class_year: number | null;
  student_status: string | null;
  prompt_key: string | null;
  prompt_answer: string | null;
  open_to: string[];
  taste_score: number | null;
  shared_artists: string[];
  shared_open_to: string[];
  shared_genres: string[];
  shared_concert: string | null;
  both_new: boolean;
  same_school: boolean;
  /** Favourite artists both people picked. Present once the favourite_artists migration is applied. */
  shared_favorites?: string[];
};

/** The strongest reasons first, at most `max` of them, so a card stays scannable. */
export function reasonsFor(s: Suggestion, max = 3): string[] {
  const reasons: string[] = [];

  if (s.shared_concert) reasons.push(`You are both going to ${s.shared_concert}`);

  const artists = (s.shared_artists ?? []).filter((a) => a.trim() !== "");
  if (artists.length > 0) reasons.push(`You both play ${joinNames(artists)}`);

  // Shared favourites matter most for new accounts, which have no plays to compare yet.
  const favorites = (s.shared_favorites ?? []).filter((a) => a.trim() !== "");
  if (favorites.length > 0 && artists.length === 0) reasons.push(`You both like ${joinNames(favorites.slice(0, 3))}`);

  const openTo = labelsFor(s.shared_open_to ?? [], OPEN_TO).map((l) => l.toLowerCase());
  if (openTo.length > 0) reasons.push(`Both open to ${joinNames(openTo)}`);

  const genres = knownGenres(s.shared_genres ?? []);
  if (genres.length > 0) reasons.push(`Both into ${joinNames(genres)}`);

  if (s.both_new) reasons.push("Both new to NYU this year");
  if (s.same_school) reasons.push(`Also in ${s.school}`);

  // Nothing in common yet is still worth showing: they asked to meet people.
  if (reasons.length === 0) {
    const theirs = labelsFor(s.open_to ?? [], OPEN_TO).map((l) => l.toLowerCase());
    if (theirs.length > 0) reasons.push(`Open to ${joinNames(theirs)}`);
  }
  return reasons.slice(0, max);
}

/** "64% match", or null when there is no score (they hide stats, or too little listening). */
export function matchLabel(s: Suggestion): string | null {
  return typeof s.taste_score === "number" && s.taste_score > 0 ? `${s.taste_score}% match` : null;
}
