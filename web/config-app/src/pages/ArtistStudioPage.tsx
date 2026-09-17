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
import { previewScreenOrder } from './screen-preview-view';
import { buildGalleryItems, type ScreenIndexShape } from './screen-index-view';
import { themeChecklist, themeProgress } from './theme-checklist';
import { useMyTheme } from './use-my-theme';

/** What an artist calls each scope. `files` is the logos a screen pulls in. */
const SCOPE_LABEL = {
  node: 'node',
  conf: 'conference',
  board: 'board',
  files: 'logos',
} as const;

export function ArtistStudioPage() {
  const { theme, choices, select, isPreparing, error, auditing, sysop } = useMyTheme();

  /*
   * WHO COULD OWN A THEME AND DOES NOT YET.
   *
   * A theme is made the first time an account opens this page, so an artist
   * who never has cannot be audited by the sysop: "all level 100 users should
   * have a copy of the default theme to start from. but they dont't i can't
   * impersonate jucke for example there are no themes for him?". The sysop
   * gets a way to start one for them; nobody else asks for the user list.
   */
  const { data: userList } = useQuery({
    queryKey: ['users'],
    queryFn: () => apiClient.getUsers(),
    enabled: sysop,
  });
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

  /**
   * Which format the thumbnails are drawn in.
   *
   * A screen exists several times over - `.txt`, `.seq`, `.rip`, `.ttx` - and
   * the gallery drew whichever file the card resolved to, almost always the
   * ANSI one. An artist reviewing the board as a C64 caller sees it had no way
   * to look at it ("we need to be able to select the screen type to list in
   * the thumbnails", sysop 2026-09-15). Empty means "whatever the screen
   * resolves to", which is how it behaved before and stays the default.
   */
  const [thumbnailFormat, setThumbnailFormat] = useState('');

  const items = useMemo(
    () => (data && theme
      ? buildGalleryItems(data, {
        theme: theme.slug,
        // An artist draws art. Leftovers, files the board writes for itself
        // and screens nothing reads are the sysop's business.
        showGenerated: false,
        showUnread: false,
        // The board's own view has no "yours" and "theirs": every screen is
        // the board's, which is the thing being edited.
        ownedBy: theme.slug === 'default' ? undefined : theme.slug,
        // A sysop auditing an artist's studio is not looking at their own art.
        ownedLabel: auditing ? `Redrawn by ${theme.owner || 'the artist'}` : 'Yours',
        // A draft is served to nobody, so the board's screens are still what
        // every caller sees - the fact that decides which of two identical
        // looking copies wins, and one no comparison of the files reveals.
        themeIsDraft: theme.status === 'draft',
        ...(thumbnailFormat ? { thumbnailFormat } : {}),
      })
      : []),
    [data, theme, auditing, thumbnailFormat],
  );

  /**
   * Every screen a finished theme has, drawn or not.
   *
   * The gallery alone showed only files that exist, so the screens with the
   * most to gain - the ones the board has no art for at all - were invisible,
   * and there was no way to start one.
   *
   * `default` is the board itself and gets no "still to redraw" list - but it
   * DOES get the art around the screens the board writes, which exists nowhere
   * else and which the sysop went looking for: "i cant find the achievement
   * frames in ansi studio".
   */
  /*
   * The checklist is a list of what a THEME still has to redraw. The board is
   * not redrawing itself: its own missing screens are the sysop's business and
   * the Screen files page is where they are managed, so `default` gets the
   * gallery and no slots.
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

  const artistsWithoutATheme = useMemo(() => {
    if (!sysop) return [];
    const owners = new Set(choices.map(entry => entry.owner.trim().toLowerCase()).filter(Boolean));
    const users = ((userList as { data?: unknown } | undefined)?.data ?? []) as
      Array<{ username?: string; secLevel?: number }>;
    return users
      // The level the admin itself is gated on: an account that can reach the
      // screens page is an account that can own a theme.
      .filter(user => (user.secLevel ?? 0) >= 100)
      .map(user => (user.username ?? '').trim())
      .filter(username => username && !owners.has(username.toLowerCase()))
      .sort((a, b) => a.localeCompare(b));
  }, [sysop, choices, userList]);

  /*
   * ART FIRST. The preview opened on whatever the catalogue listed first,
   * which is AWAITSCREEN - twenty bytes of codes that draw nothing - so the
   * panel came up black: "preview as a caller is just black in ansi studio"
   * (sysop, 2026-09-17).
   */
  const screenNames = useMemo(
    () => previewScreenOrder(data?.screens ?? [], data?.files),
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
          : sysop
            // A sysop is not given a theme on arrival; the board has none to
            // stand in yet, and the Themes tab is where one is made.
            ? <p className="text-sm text-content-secondary">No theme on this board yet. Make one on the Themes tab, or an artist gets theirs the first time they open this page.</p>
            : <p className="text-sm text-content-secondary">No theme to work in yet.</p>}
        {!sysop && <SkeletonRows rows={4} />}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ThemeStatusBar
        theme={theme}
        choices={choices}
        onSelect={select}
        screenNames={screenNames}
        auditing={auditing}
        artistsWithoutATheme={artistsWithoutATheme}
      />

      {/* The one number an artist wants, and where the work is. */}
      <div className="space-y-2 border border-border p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-content-primary">
            {progress.drawn} of {progress.total} screens drawn
          </p>
          <p className="text-sm text-content-secondary">
            {(['node', 'conf', 'board', 'files'] as const)
              .map(scope => `${SCOPE_LABEL[scope]}: ${progress.byScope[scope].drawn}/${progress.byScope[scope].total}`)
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
        <label className="flex items-center gap-2 text-sm text-content-secondary">
          Draw as
          <select
            aria-label="Draw thumbnails as"
            className="input-field"
            value={thumbnailFormat}
            onChange={event => setThumbnailFormat(event.target.value)}
          >
            {/* Empty is what the board itself would serve - the file each
                screen resolves to - and it is the default because it is what
                the gallery did before there was a choice. */}
            <option value="">What the screen resolves to</option>
            <option value="ansi">ANSI</option>
            <option value="petscii">PETSCII (.seq)</option>
            <option value="rip">RIP</option>
            <option value="teletext">Teletext (.ttx)</option>
          </select>
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

      <ScreenGallery items={shown} isLoading={isLoading} onOpen={setOpenPath} theme={theme.slug} />

      <ArtistScreenDialog
        path={openPath}
        theme={theme}
        index={data}
        isNew={!!openPath && slotByPath.get(openPath)?.drawn === false}
        newDescription={openPath ? slotByPath.get(openPath)?.description : undefined}
        onClose={() => setOpenPath(null)}
        onOpenPath={setOpenPath}
        onSwitchTheme={select}
        sysop={sysop}
        auditing={auditing}
      />
    </div>
  );
}
