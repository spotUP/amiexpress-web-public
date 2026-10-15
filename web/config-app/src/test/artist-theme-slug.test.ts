/**
 * An artist never types the name of their own theme.
 *
 * It is derived from their account, so it has to survive every handle a BBS
 * hands out - spaces, punctuation, a name that is nothing but punctuation -
 * and still be a slug the registry accepts, or the first thing an artist meets
 * is a 400 about a directory name they never chose.
 */
import { describe, expect, it } from 'vitest';
import { artistThemeSlug, artistThemeTitle, nextFreeSlug, pickArtistTheme } from '../pages/artist-theme';

/** The server's own rule, copied here so the two are compared, not assumed. */
const SERVER_SLUG = /^[a-z0-9][a-z0-9-]{0,30}$/;

describe('an account name as a theme slug', () => {
  it('becomes a slug the board will accept', () => {
    expect(artistThemeSlug('Skope')).toBe('skope');
    expect(artistThemeSlug('Mr Tango')).toBe('mr-tango');
    expect(artistThemeSlug('Skope!')).toBe('skope');
    expect(artistThemeSlug('  h7  ')).toBe('h7');
  });

  it('survives handles the registry would refuse', () => {
    for (const name of ['Mr Tango', '!!!', '-lead', '607080', 'A'.repeat(60), 'ünïcödé']) {
      expect(SERVER_SLUG.test(artistThemeSlug(name))).toBe(true);
    }
  });

  it('gives a name that is all punctuation something to be called', () => {
    expect(artistThemeSlug('***')).toBe('artist');
  });

  it('titles it after the artist, not after the slug', () => {
    expect(artistThemeTitle('Mr Tango')).toBe("Mr Tango's screens");
    expect(artistThemeTitle('  ')).toBe('My screens');
  });
});

describe('a slug somebody already has', () => {
  it('gets the next free one', () => {
    expect(nextFreeSlug('neon', new Set())).toBe('neon');
    expect(nextFreeSlug('neon', new Set(['neon']))).toBe('neon-2');
    expect(nextFreeSlug('neon', new Set(['neon', 'neon-2']))).toBe('neon-3');
  });

  it('stays a slug the board will accept, however long the name was', () => {
    const long = artistThemeSlug('A'.repeat(60));
    expect(SERVER_SLUG.test(nextFreeSlug(long, new Set([long])))).toBe(true);
  });
});

describe('which of my themes I land in', () => {
  it('is the one added last, because that is the one being worked on', () => {
    expect(pickArtistTheme([{ slug: 'old' }, { slug: 'new' }])?.slug).toBe('new');
  });

  it('is nothing at all when I own none', () => {
    expect(pickArtistTheme([])).toBeNull();
  });
});
