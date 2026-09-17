/**
 * A quicklink list of everything on this board worth playing.
 *
 * A board with the restoration archive installed carries fifteen hundred
 * recovered broadcast days. Almost all of them are a Tuesday's news, and
 * the handful that carry a game are scattered across years and networks
 * with page numbers nobody could be expected to remember - Bamboozle on
 * Channel 4's 152, a quiz behind hidden page 30A on ITV Yorkshire, sixteen
 * BBC programs on Ceefax 704 to 719.
 *
 * So the board writes down where they are, once, and the browser opens on
 * that list instead of asking the caller to go looking.
 */

/** What kind of thing a caller is being pointed at. */
export type CatalogueKind =
  /** A BBC Micro program broadcast as telesoftware. */
  | 'program'
  /** An interactive game played by following the page links. */
  | 'game'
  /** Something else worth reading - a magazine, a comic strip. */
  | 'feature';

export interface CatalogueEntry {
  /** The pack it lives in. */
  service: string;
  /** The pack's own name, for the line the caller reads. */
  serviceTitle: string;
  /** The page to open on. */
  page: number;
  kind: CatalogueKind;
  /** What to call it. */
  label: string;
  /** For a program, what to type on the Beeb. */
  command?: string;
  /** For a program, whether it actually loads. */
  playable?: boolean;
}

export interface Catalogue {
  /** When it was built, so a stale one can say so. */
  built: string;
  entries: CatalogueEntry[];
}

/** The file, beside the packs rather than inside any one of them. */
export const CATALOGUE_FILE = 'catalogue.json';

/** Games first, then programs, then the rest; oldest first within each. */
export function sortCatalogue(entries: CatalogueEntry[]): CatalogueEntry[] {
  const rank: Record<CatalogueKind, number> = { game: 0, program: 1, feature: 2 };
  return [...entries].sort((a, b) => {
    if (rank[a.kind] !== rank[b.kind]) return rank[a.kind] - rank[b.kind];
    if (a.serviceTitle !== b.serviceTitle) return a.serviceTitle.localeCompare(b.serviceTitle);
    return a.page - b.page;
  });
}

/** Only the entries a caller can actually do something with. */
export function playableOnly(entries: CatalogueEntry[]): CatalogueEntry[] {
  return entries.filter(entry => entry.kind !== 'program' || entry.playable !== false);
}
