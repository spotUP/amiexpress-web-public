/**
 * An artist's own theme: the name it gets, and which one they land in.
 *
 * Every one of these is a pure rule with no React and no fetch, because each
 * is a decision somebody will want to change: what an account is called as a
 * directory, what to do when that name is taken, and which of several themes
 * an artist meant. A decision buried in a component is a decision nobody can
 * test.
 */

/** The registry's own rule (`theme-registry.ts`), which the server enforces. */
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,30}$/;

/**
 * A BBS account name as a theme slug the registry will accept.
 *
 * `Mr Tango` -> `mr-tango`, `Skope!` -> `skope`. This is a DIRECTORY name and
 * nothing more: ownership is matched on the account itself, so an artist whose
 * handle is all punctuation still owns their theme - they just get a plainer
 * folder. A name that leaves nothing behind falls back to `artist`, which is
 * a real slug rather than a crash.
 */
export function artistThemeSlug(username: string): string {
  const slug = username
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 31)
    .replace(/-+$/, '');

  return SLUG_PATTERN.test(slug) ? slug : 'artist';
}

/** The title an artist never had to type. */
export function artistThemeTitle(username: string): string {
  const name = username.trim();
  return name ? `${name}'s screens` : 'My screens';
}

/**
 * The next slug nobody has taken: `neon`, `neon-2`, `neon-3`.
 *
 * Needed because a slug is derived from an account name and two boards' worth
 * of history can already hold it - somebody else's theme called `tango`, or
 * the artist's own from before. The server refuses a duplicate, so the client
 * has to have somewhere to go.
 */
export function nextFreeSlug(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; n < 100; n++) {
    const candidate = `${base}-${n}`.slice(0, 31).replace(/-+$/, '');
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`.slice(0, 31);
}

/**
 * Which of my themes I land in: the one added LAST.
 *
 * `Themes.info` is written in `TYPE.n` order and entries are appended, so the
 * last entry is the newest. That is a CONVENTION of the registry writer, not a
 * timestamp on disk - there is no created-at to sort by, and sorting these
 * alphabetically instead would silently change which theme an artist opens.
 */
export function pickArtistTheme<T extends { slug: string }>(mine: T[]): T | null {
  return mine.length > 0 ? mine[mine.length - 1] : null;
}
