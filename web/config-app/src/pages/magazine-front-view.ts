/**
 * What the Magazine page shows, as pure functions.
 *
 * The edits to the front page itself (add, remove, move, make lead) are the
 * SDK's - the MAG door and the board's route use the same ones - so this file
 * holds only what is the page's own: which candidates are listed, and which
 * stories sit on the front page in order.
 */
import type { MagazineStorySummary } from '../types/magazine';

export const ALL_DESKS = 'all';

export interface CandidateFilter {
  /** A desk code, or `ALL_DESKS`. */
  desk: string;
  /** Matches the headline, the site or the desk label, case-insensitively. */
  query: string;
}

export function filterCandidates(
  stories: readonly MagazineStorySummary[],
  filter: CandidateFilter,
): MagazineStorySummary[] {
  const term = filter.query.trim().toLowerCase();
  return stories.filter((s) => {
    if (filter.desk !== ALL_DESKS && s.desk !== filter.desk) return false;
    if (!term) return true;
    return [s.headline, s.source, s.deskLabel].some((field) => field.toLowerCase().includes(term));
  });
}

/** The desks that have at least one article, in the order the labels sort. */
export function deskOptions(stories: readonly MagazineStorySummary[]): Array<{ desk: string; label: string }> {
  const seen = new Map<string, string>();
  for (const s of stories) seen.set(s.desk, s.deskLabel);
  return [...seen].map(([desk, label]) => ({ desk, label })).sort((a, b) => a.label.localeCompare(b.label));
}

/** The front page as stories, in order. An id with no story behind it is dropped. */
export function frontStories(
  front: readonly string[],
  stories: readonly MagazineStorySummary[],
): MagazineStorySummary[] {
  const byId = new Map(stories.map((s) => [s.id, s]));
  return front.flatMap((id) => {
    const s = byId.get(id);
    return s ? [s] : [];
  });
}
