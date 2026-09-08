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
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

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
  mine: ArtistTheme[];
  select: (slug: string) => void;
  isPreparing: boolean;
  error: Error | null;
} {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const username = String((user as { username?: string } | null)?.username ?? '').trim();
  const [chosen, setChosen] = useState<string | null>(null);
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
  const themes = payload?.themes ?? [];
  const mine = themes.filter(entry => entry.mine);

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
    if (mine.length > 0 || creating.current) return;
    if (attempts.current >= SLUG_ATTEMPTS) return;

    creating.current = true;
    attempts.current += 1;
    const taken = new Set(themes.map(entry => entry.slug));
    create.mutate(nextFreeSlug(artistThemeSlug(username), taken));
  }, [isFetched, username, mine.length, themes, create]);

  const theme = mine.find(entry => entry.slug === chosen) ?? pickArtistTheme(mine);

  return {
    theme,
    mine,
    select: setChosen,
    isPreparing: !isFetched || (mine.length === 0 && error === null),
    error,
  };
}
