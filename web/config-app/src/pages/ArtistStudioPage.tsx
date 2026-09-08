/**
 * The screens page an artist gets: their theme, drawn.
 *
 * A sysop configures the board's screens and needs the tables, the door art,
 * the codes, the duplicates and the list of what nothing reads. An artist
 * redraws a theme, and the sandbox already refuses them everything else - so
 * offering it was a menu of 403s to find the handful of files they may touch
 * among nine hundred. Asked for, 2026-09-08: "only sysops should see files
 * with no art in them etc".
 *
 * One view: what a caller wearing this theme is served, as cards, with the
 * theme's own state above it.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { apiClient } from '../api/client';
import { ScreenGallery } from '../components/ScreenGallery';
import { SkeletonRows } from '../components/ui/states';
import { ArtistScreenDialog } from './ArtistScreenDialog';
import { ThemeStatusBar } from './ThemeStatusBar';
import { buildGalleryItems, type ScreenIndexShape } from './screen-index-view';
import { useMyTheme } from './use-my-theme';

export function ArtistStudioPage() {
  const { theme, mine, select, isPreparing, error } = useMyTheme();
  const [openPath, setOpenPath] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // The same key and the same (unwrapped) shape the sysop's page caches under.
  const { data, isLoading } = useQuery({
    queryKey: ['screen-index', theme?.slug],
    queryFn: async () => (await apiClient.getScreenIndex(theme?.slug)).data as ScreenIndexShape,
    enabled: !!theme,
  });

  const items = useMemo(
    () => (data && theme
      ? buildGalleryItems(data, {
        theme: theme.slug,
        // An artist draws art. Leftovers, files the board writes for itself
        // and screens nothing reads are the sysop's business.
        showGenerated: false,
        showUnread: false,
        ownedBy: theme.slug,
      })
      : []),
    [data, theme],
  );

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return items;
    return items.filter(item =>
      item.label.toLowerCase().includes(needle) || item.path.toLowerCase().includes(needle));
  }, [items, search]);

  const screenNames = useMemo(
    () => (data?.screens ?? []).map(entry => entry.screen),
    [data],
  );

  if (error) {
    return (
      <div className="space-y-2">
        <h1 className="text-content-primary">Screens</h1>
        <p className="text-sm text-status-danger">{error.message}</p>
      </div>
    );
  }

  if (!theme) {
    return (
      <div className="space-y-3">
        <h1 className="text-content-primary">Screens</h1>
        {isPreparing
          ? <p className="text-sm text-content-secondary">Setting up your theme from the board&apos;s screens</p>
          : <p className="text-sm text-content-secondary">No theme yet.</p>}
        <SkeletonRows rows={4} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ThemeStatusBar theme={theme} mine={mine} onSelect={select} screenNames={screenNames} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-content-secondary">
          Every screen a caller wearing {theme.title} is served. Click one to draw it.
        </p>
        <input
          type="search"
          aria-label="Search screens"
          className="input w-56"
          placeholder="Search"
          value={search}
          onChange={event => setSearch(event.target.value)}
        />
      </div>

      <ScreenGallery items={shown} isLoading={isLoading} onOpen={setOpenPath} />

      <ArtistScreenDialog
        path={openPath}
        theme={theme}
        index={data}
        onClose={() => setOpenPath(null)}
        onOpenPath={setOpenPath}
      />
    </div>
  );
}
