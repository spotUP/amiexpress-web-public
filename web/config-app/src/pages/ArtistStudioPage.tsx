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
import { themeChecklist, themeProgress } from './theme-checklist';
import { useMyTheme } from './use-my-theme';

export function ArtistStudioPage() {
  const { theme, mine, select, isPreparing, error } = useMyTheme();
  const [openPath, setOpenPath] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  /** Everything, or only what is still to draw. */
  const [todoOnly, setTodoOnly] = useState(false);

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

  /**
   * Every screen a finished theme has, drawn or not.
   *
   * The gallery alone showed only files that exist, so the screens with the
   * most to gain - the ones the board has no art for at all - were invisible,
   * and there was no way to start one.
   */
  const slots = useMemo(
    () => (theme ? themeChecklist(data, theme.slug) : []),
    [data, theme],
  );
  const progress = useMemo(() => themeProgress(slots), [slots]);
  const undrawn = useMemo(() => slots.filter(slot => !slot.drawn), [slots]);
  const slotByPath = useMemo(
    () => new Map(slots.map(slot => [slot.path, slot] as const)),
    [slots],
  );

  /** The undrawn slots as cards, so starting one is a click like any other. */
  const todoItems = useMemo(
    () => undrawn.map(slot => ({
      path: slot.path,
      label: slot.screen + (slot.conference ? ` - conference ${slot.conference}` : ''),
      detail: slot.description || 'Not drawn yet',
      placeholder: true,
      badge: { label: 'Not drawn yet', kind: 'todo' as const },
    })),
    [undrawn],
  );

  const shown = useMemo(() => {
    const all = todoOnly ? todoItems : [...items, ...todoItems];
    const needle = search.trim().toLowerCase();
    if (!needle) return all;
    return all.filter(item =>
      item.label.toLowerCase().includes(needle) || item.path.toLowerCase().includes(needle));
  }, [items, todoItems, todoOnly, search]);

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

      {/* The one number an artist wants, and where the work is. */}
      <div className="space-y-2 border border-border p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-content-primary">
            {progress.drawn} of {progress.total} screens drawn
          </p>
          <p className="text-sm text-content-secondary">
            {(['node', 'conf', 'board'] as const)
              .map(scope => `${scope === 'conf' ? 'conference' : scope}: ${progress.byScope[scope].drawn}/${progress.byScope[scope].total}`)
              .join('   ')}
          </p>
        </div>
        <div className="h-2 w-full bg-surface-2" aria-hidden="true">
          <div
            className="h-full bg-accent"
            style={{ width: `${progress.total ? Math.round((progress.drawn / progress.total) * 100) : 0}%` }}
          />
        </div>
        <p className="text-sm text-content-secondary">
          Anything you do not draw falls back to the board's own art, so a theme
          works from the first screen onwards.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm text-content-secondary">
          <input type="checkbox" checked={todoOnly} onChange={event => setTodoOnly(event.target.checked)} />
          Only what is still to draw ({undrawn.length})
        </label>
        <input
          type="search"
          aria-label="Search screens"
          className="input-field w-56"
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
        isNew={!!openPath && slotByPath.get(openPath)?.drawn === false}
        newDescription={openPath ? slotByPath.get(openPath)?.description : undefined}
        onClose={() => setOpenPath(null)}
        onOpenPath={setOpenPath}
      />
    </div>
  );
}
