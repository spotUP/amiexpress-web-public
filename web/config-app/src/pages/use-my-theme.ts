/**
 * The theme an artist works in - found, or made for them.
 *
 * An artist is a non-sysop who owns a theme, and ownership is the server's
 * answer: every row of `GET /api/themes` carries `mine`. An artist who owns
 * none has nothing to draw in, so one is made from the board's own screens
 * (the create route seeds it) without asking - the sysop's decision, 2026-09-08:
 * zero friction over an explicit click.
 *
 * The create is single-flight and the slug is DETERMINISTIC on purpose. Two
 * tabs of the same admin both reach here; the second is answered 409 by the
 * server, re-reads the list and adopts the theme the first one made. A slug
 * the server invented per request would answer both yes and leave the artist
 * with two themes.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';

import { apiClient } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { artistThemeSlug, artistThemeTitle, nextFreeSlug, pickArtistTheme } from './artist-theme';

export interface ArtistTheme {
  slug: string;
  title: string;
  status: 'draft' | 'review' | 'live';
  dir: string;
  owner: string;
  screens: number | null;
  mine: boolean;
}

interface ThemesPayload {
  themes?: ArtistTheme[];
  defaultSlug?: string;
  canCreate?: boolean;
}

/** How many times a taken slug is worth stepping past before saying so. */
const SLUG_ATTEMPTS = 3;

export function useMyTheme(): {
  theme: ArtistTheme | null;
  /** The themes this account may work in - its own, or every one for a sysop. */
  choices: ArtistTheme[];
  select: (slug: string) => void;
  isPreparing: boolean;
  error: Error | null;
  /**
   * True when the open theme belongs to somebody else.
   *
   * A sysop asked to be able to stand in an artist's studio: "as a sysop i
   * need to be able to personate a user/artist in the ansi studio to audit and
   * fix issues in their themes". The board already allows the writes - a
   * sysop's `writableRoots` is the board root - so this is the view, and the
   * flag is what tells the page to say whose work it is showing.
   */
  auditing: boolean;
  /** True for a sysop: they are visiting, not waiting for a theme of their own. */
  sysop: boolean;
} {
  const queryClient = useQueryClient();
  const { user, secLevel } = useAuth();
  const username = String((user as { username?: string } | null)?.username ?? '').trim();
  /** The board's own level for "may administer" - the same number App.tsx gates on. */
  const sysop = secLevel >= 255;
  /*
   * `?theme=<slug>` OPENS ON THAT THEME.
   *
   * The Themes page has linked here since S6 - "Open the art" on every row -
   * and the link did nothing at all: the page always opened on whatever the
   * picker would have chosen anyway. It is also how a sysop hands another
   * sysop a look at one artist's work.
   *
   * The URL is the initial value, not the state: changing the picker
   * afterwards must not be argued with by the address bar.
   */
  const [searchParams, setSearchParams] = useSearchParams();
  const linked = (searchParams.get('theme') ?? '').trim() || null;
  const [chosen, setChosenState] = useState<string | null>(linked);
  const setChosen = useCallback((slug: string | null) => {
    setChosenState(slug);
    // The address bar follows the picker, so the page can be linked to in the
    // state it is in - and a reload comes back to the same theme.
    setSearchParams(previous => {
      const next = new URLSearchParams(previous);
      if (slug) next.set('theme', slug);
      else next.delete('theme');
      return next;
    }, { replace: true });
  }, [setSearchParams]);
  const [error, setError] = useState<Error | null>(null);
  /** One create per browser tab, whatever React does with effects. */
  const creating = useRef(false);
  const attempts = useRef(0);

  // The ENVELOPE, unwrapped at use: the themes page caches this key the same
  // way, and two shapes under one key is a bug this admin has already had.
  const { data, isFetched } = useQuery({
    queryKey: ['screen-themes'],
    queryFn: () => apiClient.getScreenThemes(),
  });
  const payload = (data as { data?: ThemesPayload } | undefined)?.data;
  /*
   * MEMOISED because it is a useEffect DEPENDENCY below.
   *
   * `?? []` mints a new array on every render, so the effect that creates an
   * artist's theme re-ran on every single one. Its own guards (`creating`,
   * `attempts`) meant that cost nothing worse than churn, but they were doing
   * a job the dependency list should have been doing.
   */
  const themes = useMemo(() => payload?.themes ?? [], [payload]);
  const mine = themes.filter(entry => entry.mine);
  /*
   * A sysop stands in ANY artist's studio.
   *
   * `default` is the board's own screens and has no directory of its own, so
   * it is not a theme anybody draws in - the registry answers with an empty
   * `dir` and the copy route refuses it.
   */
  /*
   * `default` IS a thing to draw in, for whoever may.
   *
   * It is the board's own screens and has no directory of its own, so it was
   * filtered out of the picker - which left the sysop unable to edit the
   * board's art from the studio at all: "while developing amiexpress the
   * sysop needs to be able to edit the default theme as well, also tango
   * needs to be able to do it as he will make it".
   *
   * A sysop always may; anybody else may when the registry names them as its
   * OWNER, which is the same rule every other theme uses, and the board grants
   * that account the ART directories only (`theme-sandbox.boardScreenRoots`).
   */
  const boardsOwn: ArtistTheme = {
    slug: 'default',
    title: "The board's own screens",
    status: 'live',
    dir: '',
    owner: '',
    screens: null,
    mine: true,
  };

  /*
   * A sysop is always offered the board's own screens, whether or not the
   * registry has a row for them.
   *
   * `default` is the board itself; most boards have no `TYPE.n=default` line
   * at all (this one does not), so requiring the row would have shown the
   * sysop nothing. A row is only needed to hand the board's art to SOMEBODY
   * ELSE - its `OWNER.n` is what the sandbox grants on, and the row's own
   * title wins over this one when it exists.
   */
  const registered = themes.filter(entry => entry.dir.trim() !== '' || entry.slug === 'default');
  const choices = sysop
    ? (registered.some(entry => entry.slug === 'default') ? registered : [boardsOwn, ...registered])
    : themes.filter(entry => entry.mine);

  const create = useMutation({
    // Never retried. The admin retries mutations once by default, which is
    // right for a lost packet and wrong for this: the slug is deterministic,
    // so a refusal is an answer ("somebody has that name"), and asking again
    // a second later just writes a second theme.
    retry: false,
    mutationFn: (slug: string) => apiClient.createScreenTheme({
      slug,
      title: artistThemeTitle(username),
      author: username,
      widths: [80],
    }),
    onSuccess: async () => {
      creating.current = false;
      await queryClient.invalidateQueries({ queryKey: ['screen-themes'] });
    },
    onError: async (failure: Error) => {
      creating.current = false;
      // Somebody has the slug - the other tab, or another artist. Re-read
      // before deciding: if a theme is now mine the race is over and won.
      await queryClient.invalidateQueries({ queryKey: ['screen-themes'] });
      if (attempts.current >= SLUG_ATTEMPTS) setError(failure);
    },
  });

  useEffect(() => {
    if (!isFetched || !username) return;
    // A sysop is not an artist. Opening the studio to audit somebody's work
    // must not mint a theme in the sysop's name on the way in.
    if (sysop) return;
    if (mine.length > 0 || creating.current) return;
    if (attempts.current >= SLUG_ATTEMPTS) return;

    creating.current = true;
    attempts.current += 1;
    const taken = new Set(themes.map(entry => entry.slug));
    create.mutate(nextFreeSlug(artistThemeSlug(username), taken));
  }, [isFetched, sysop, username, mine.length, themes, create]);

  const theme = choices.find(entry => entry.slug === chosen)
    // A sysop with nothing chosen lands on their own theme when they have one,
    // so the tab opens on their work rather than on a stranger's.
    ?? pickArtistTheme(sysop && mine.length > 0 ? mine : choices);

  return {
    theme,
    choices,
    select: setChosen,
    // A sysop who owns no theme is not waiting for one to be made.
    isPreparing: !isFetched || (!sysop && mine.length === 0 && error === null),
    error,
    auditing: theme !== null && !theme.mine,
    sysop,
  };
}
