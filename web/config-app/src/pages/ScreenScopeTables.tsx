import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileImage, AlertTriangle, Share2 } from 'lucide-react';
import { apiClient, type ApiError } from '../api/client';
import { useNotification } from '../contexts/NotificationContext';
import { describeScreen } from './screen-descriptions';
import { callSitesFor } from './screen-provenance';
import { summariseShare, type ShareSummary } from './screen-share-view';
import { DataTable, type DataTableColumn } from '../components/ui/DataTable';
import { TabbedWorkspace, type TabDefinition } from '../components/ui/Tabs';
import { ScreenThumbnail } from '../components/ScreenThumbnail';
import { formatBytes } from '../lib/format';
import { DoorArtList } from './DoorArtList';
import { ArtistScreenDialog } from './ArtistScreenDialog';
import { ErrorPanel } from '../components/ui/states';
import type { ArtistTheme } from './use-my-theme';
import {
  toScreenRows, filterScreenRows,
  type ScreenIndexShape, type ScreenRow, type ScreenIndexEntryShape,
  type ScopeResolutionShape, type ConferenceShape,
  type ScreenFileShape,
  formatsPresent, missingFormats,
  isDoorArt, isCommandsOnly, isNotArt,
} from './screen-index-view';

const EMPTY_ROWS: ScreenRow[] = [];

/**
 * What a scope is called, in the board's own words.
 *
 * "Conf2" means nothing to a designer, and a renumbered board makes it worse:
 * conference 1 lives in Conf2 here. The conference's NAME is what a sysop
 * recognises - "Amiga Demoscene" - so it leads, with the number behind it.
 */
/**
 * The conference a file sits in, named the way a sysop knows it.
 *
 * The DIRECTORY number is not the conference number - express.e reads
 * `LOCATION.n` from ConfConfig.info, and on this board conference 1 lives in
 * `Conf2` - so this matches the directory against what each conference
 * declares rather than parsing the digits out of the path.
 */
export function conferenceOfPath(
  relPath: string | null,
  conferences?: ConferenceShape[],
): string | null {
  if (!relPath) return null;

  const dir = relPath.split(/[\\/]/)[0];
  if (!/^Conf\d+$/i.test(dir)) return null;

  const named = (conferences ?? []).find(c => c.dir?.toLowerCase() === dir.toLowerCase());
  if (named) return `${named.name} (conference ${named.id})`;

  // The board did not say - name the directory rather than invent a number.
  return dir;
}

function scopeName(scope: string, id: number | null, conferences?: ConferenceShape[]): string {
  if (scope === 'node') return `Node ${id}`;
  if (scope === 'conf') {
    const conf = conferences?.find(c => c.id === id);
    return conf ? `${conf.name} (conference ${id})` : `Conference ${id}`;
  }
  return 'Board root';
}

/**
 * Every screen the board can display, where it resolves from, and what it
 * looks like.
 *
 * Screens first, files underneath: a file only matters through the screen it
 * serves, and "which file does node 7 display for BBSTITLE" is the question
 * nobody could answer before this page.
 */






/**
 * The format chips' rule lives in `screen-index-view` beside the gallery it
 * serves; re-exported here because three suites and the file dialog have
 * always asked this module for it.
 */
export { formatsPresent, missingFormats };


export function ScreenScopeTables() {
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useNotification();

  const [query, setQuery] = useState('');
  const [openScreen, setOpenScreen] = useState<string | null>(null);
  const [openFile, setOpenFile] = useState<string | null>(null);
  /**
   * The last failure from a board-wide action, shown on the page itself.
   *
   * It used to be rendered inside this page's own modal, which the one dialog
   * replaced. The actions that set it - repair, delete, the share planner -
   * are the page's, not the dialog's, so the message belongs on the page.
   */
  const [fileError, setFileError] = useState<string | null>(null);
  const [shareSummary, setShareSummary] = useState<ShareSummary | null>(null);
  /**
   * Which directory to point nodes at.
   *
   * This was hardcoded to `Screens/Shared`, which the live board does not have
   * - so the action answered "The shared directory is outside the board root",
   * which was not true either. The board reports what it has; this asks.
   */
  const [sharedDir, setSharedDir] = useState('');
  /**
   * Whether to draw files a designer never edits.
   *
   * "It shows generated screens as well. those are not relevant." Off by
   * default; a toggle rather than a filter in the code, because a file the
   * manager refuses to show is a file nobody can find.
   */
  const [showGenerated, setShowGenerated] = useState(false);
  /**
   * Art on the volume that no screen, node, conference or bulletin reads.
   *
   * Off by default: "i see a lot of read by nothing in the gallery the artists
   * are not interested in those". It is still one checkbox away, and the whole
   * list has a tab of its own - a file the manager refuses to show is a file a
   * sysop cannot find.
   */


  const detailRef = useRef<HTMLElement>(null);

  /**
   * Which theme the page is looking through. `default` is the board's own
   * screens; any other slug rebuilds the whole page - gallery, tables,
   * duplicates, preview - as a caller wearing that theme is served. Asked for
   * in these words: "a select button on the screen files page that lets the
   * user select among his themes and the gallery etc updates".
   */
  const [theme, setTheme] = useState('default');
  /*
   * The SAME key and the SAME shape as ScreenThemesPage's query.
   *
   * This cached the unwrapped payload while that page caches the ENVELOPE and
   * unwraps at the use site. React Query keys the cache, not the shape, so
   * whichever ran last won - and the Screens workspace opens on THIS tab, so
   * the themes page then read `data.data`, got undefined, and decided the
   * sysop could not create a theme. The New theme button vanished.
   */
  const { data: themeEnvelope } = useQuery({
    queryKey: ['screen-themes'],
    queryFn: () => apiClient.getScreenThemes(),
  });
  const themeList = (themeEnvelope as { data?: { themes?: Array<{ slug: string; title: string; status: string }> } } | undefined)?.data;
  /**
   * The theme the dialog is standing in, as an object.
   *
   * The page picks a theme by SLUG, in its "Viewing" selector; the dialog
   * takes the whole theme, because it names the theme in its own sentences
   * ("Redraw this in ..."). `default` is the board itself and has no entry in
   * the registry, which is why it is spelled out here rather than looked up.
   */
  const dialogTheme: ArtistTheme = useMemo(() => {
    const found = themeList?.themes?.find(t => t.slug === theme);
    if (found) return found as ArtistTheme;
    return {
      slug: 'default',
      title: "the board's own screens",
      status: 'live',
      dir: '',
      owner: '',
      screens: null,
      // A sysop on this page may write the board, which is what `default` is.
      mine: true,
    };
  }, [themeList, theme]);


  /*
    PREVIEW IS PER THEME, so it stays beside the selector that picks one.
    Screen health reports on the board's own files and has no theme to choose;
    an artist previews their own from the status bar. Two mounts, one each,
    where there were three.
  */

  const { data, isLoading, error } = useQuery({
    queryKey: ['screen-index', theme],
    // The routes answer `{ success, data, ... }`; every admin page reads `.data`.
    queryFn: async () => (await apiClient.getScreenIndex(theme)).data as ScreenIndexShape,
  });


  const { data: sharedDirs } = useQuery({
    queryKey: ['shared-screen-dirs'],
    queryFn: async () => (await apiClient.getSharedScreenDirs()).data as {
      directories: { dir: string; files: number }[];
    },
  });

  useEffect(() => {
    if (!openScreen || !detailRef.current) return;
    // The table is as tall as the board has screens, so the panel opens off
    // the bottom of the window and the click reads as "nothing happened".
    // Optional call: jsdom has no scrollIntoView, and neither does every
    // embedded browser.
    detailRef.current.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }, [openScreen]);

  useEffect(() => {
    const first = sharedDirs?.directories?.[0]?.dir;
    if (!sharedDir && first) setSharedDir(first);
  }, [sharedDirs, sharedDir]);

  const rows = useMemo(() => (data ? toScreenRows(data) : EMPTY_ROWS), [data]);
  const visible = useMemo(() => filterScreenRows(rows, query), [rows, query]);

  /**
   * One table per kind of screen.
   *
   * Every screen the board can display used to sit in one table - node screens,
   * conference screens and board screens one after another, 85 rows of them,
   * with the detail panel below the lot. A node's BBSTITLE and a conference's
   * MENU are different questions and they are asked separately now.
   */
  const byScope = useMemo(() => ({
    node: visible.filter(row => row.dirType === 'node'),
    conf: visible.filter(row => row.dirType === 'conf'),
    global: visible.filter(row => row.dirType === 'global'),
  }), [visible]);


  const entry: ScreenIndexEntryShape | undefined = data?.screens.find(s => s.screen === openScreen);





  /**
   * Ask the backend, per node, whether it can read the shared directory - and
   * show what each blocked node would lose or gain. The dry run writes
   * nothing, so this is safe to run before deciding.
   */
  const previewShare = async (paths: string[]) => {
    const nodes = paths
      .map(p => Number(/^Node(\d+)/.exec(p)?.[1]))
      .filter(n => Number.isFinite(n)) as number[];
    if (!nodes.length) return;

    /** The board's per-node verdicts, in the shape summariseShare reads. */
    const verdicts = (
      canShare: number[],
      blocked: { id: number; reasons: string[]; losing?: string[]; gaining?: string[] }[],
    ) => ({
      ...Object.fromEntries(canShare.map(id => [id, {
        ok: true, reasons: [], losing: [], gaining: [], nodeHasNoScreens: false,
      }])),
      ...Object.fromEntries(blocked.map(b => [b.id, {
        ok: false, reasons: b.reasons, losing: b.losing ?? [], gaining: b.gaining ?? [],
        nodeHasNoScreens: false,
      }])),
    });

    try {
      // A dry run ANSWERS - including "these five cannot, here is why" - so the
      // whole verdict arrives on the success path. It used to come back as a
      // 409, which the browser logged as a failed request and the page had to
      // read out of an exception.
      const res = await apiClient.shareScreens(nodes, sharedDir, true);
      const data = res.data as {
        blocked?: { id: number; reasons: string[]; losing?: string[]; gaining?: string[] }[];
        canShare?: number[];
        wouldWrite?: string[];
      } | undefined;

      const blocked = data?.blocked ?? [];
      const canShare = data?.canShare ?? (blocked.length ? [] : nodes);
      setShareSummary(summariseShare(verdicts(canShare, blocked)));

      if (!blocked.length) {
        showSuccess(`${data?.wouldWrite?.length ?? nodes.length} node icons would be written`);
      }
    } catch (error) {
      // A real refusal still arrives as an error, and still carries the facts.
      const payload = (error as ApiError).data as {
        blocked?: { id: number; reasons: string[]; losing?: string[]; gaining?: string[] }[];
        canShare?: number[];
      } | undefined;

      if (payload?.blocked) {
        setShareSummary(summariseShare(verdicts(payload.canShare ?? [], payload.blocked)));
      } else {
        showError((error as Error).message);
      }
    }
  };

  const applyShare = async (nodes: number[]) => {
    try {
      await apiClient.shareScreens(nodes, sharedDir);
      showSuccess(`${nodes.length} node${nodes.length === 1 ? '' : 's'} now read ${sharedDir}`);
      setShareSummary(null);
      queryClient.invalidateQueries({ queryKey: ['screen-index'] });
    } catch (error) {
      showError((error as Error).message);
    }
  };



  /*
    DELETING A SCREEN lives in the dialog a row opens, which words it for the
    board's own screen rather than for an artist dropping their copy. This
    page's own copy went with the tables that carried it.
  */
  const columns: DataTableColumn<ScreenRow>[] = [
    {
      /*
       * The picture first, in every tab.
       *
       * Asked for directly: "it would be nice with thumbnails for all screen
       * files in all the tabs". A designer recognises the art and never the
       * path, and that was true of the gallery long before it was true of
       * these tables - the tables listed BBSTITLE, MENU, CONF_BULL and left a
       * person to guess which picture each one is.
       *
       * Affordable now: a thumbnail draws at thumbnail size and gives its
       * pixels back when it scrolls away, so a table of 872 rows costs what
       * is on screen rather than everything ever scrolled past.
       */
      id: 'art',
      header: 'Art',
      value: row => row.previewPath ?? '',
      cell: row => (
        row.previewPath
          ? (
            <div className="h-16 w-28 overflow-hidden bg-black">
              <ScreenThumbnail path={row.previewPath} scale={0.14} className="h-full" theme={theme} />
            </div>
          )
          // A screen that resolves nowhere has nothing to draw, and saying so
          // is the row's most important fact.
          : <span className="text-xs text-content-muted">nothing to draw</span>
      ),
    },
    {
      id: 'screen',
      header: 'Screen',
      value: row => row.screen,
      sortable: true,
      cell: row => (
        <span>
          <span className="font-mono text-content-primary">{row.screen}</span>
          {/* The name is what the board calls the file; this is what the sysop
              was looking for. "I can't see the screen files that are shown when
              i join a conference" - they were CONF_BULL and MENU. */}
          {describeScreen(row.screen) && (
            <span className="block text-xs text-content-secondary">{describeScreen(row.screen)}</span>
          )}
        </span>
      ),
    },
    { id: 'scope', header: 'Reads from', value: row => row.scopeLabel, sortable: true },
    { id: 'resolved', header: 'Resolves', value: row => row.resolvedCount, align: 'right', sortable: true },
    {
      id: 'missing',
      header: 'Missing',
      align: 'right',
      sortable: true,
      value: row => row.missingCount,
      cell: row => (
        <span className={row.missingCount > 0 ? 'text-status-warn' : 'text-content-primary'}>
          {row.missingCount}
        </span>
      ),
    },
    {
      id: 'distinct',
      header: 'Distinct contents',
      align: 'right',
      sortable: true,
      value: row => row.distinctContents,
      cell: row => (
        <span className="text-content-primary">
          {row.distinctContents}
          {row.distinctContents === 1 && row.resolvedCount > 1 ? ' (all identical)' : ''}
        </span>
      ),
    },
    {
      id: 'broken',
      header: 'Broken references',
      align: 'right',
      sortable: true,
      value: row => row.brokenReferences,
      cell: row =>
        row.brokenReferences > 0 ? (
          <span className="text-status-danger inline-flex items-center gap-1">
            <AlertTriangle size={14} /> {row.brokenReferences}
          </span>
        ) : (
          <span className="text-content-primary">0</span>
        ),
    },
  ];

  /** One row per scope a screen resolves in - the same DataTable as everywhere else. */
  const resolutionColumns: DataTableColumn<ScopeResolutionShape>[] = [
    {
      id: 'scope',
      header: 'Where',
      value: res => scopeName(res.scope, res.id, data?.conferences),
      sortable: true,
    },
    {
      id: 'dir',
      header: 'Reads',
      value: res => res.dir,
      cell: res => (
        <span className="font-mono">
          {res.dir}
          {res.dirIsShared && <span className="text-content-muted"> (shared)</span>}
        </span>
      ),
    },
    {
      id: 'file',
      header: 'File',
      value: res => res.file ?? '',
      cell: res => (res.file ? (
        <span className="font-mono underline">{res.file}</span>
      ) : (
        <span className="text-status-warn">nothing resolves</span>
      )),
    },
    {
      id: 'variants',
      header: 'Variants',
      value: res => res.variants.join(' '),
      // Each variant OPENS. They were plain text, so a screen's PETSCII and RIP
      // variants were listed and unreachable - the row opened the file the
      // resolver picked, which for an ANSI caller is always the .txt. That is
      // why the board's .seq and .rip art looked absent from this page.
      cell: res => (
        <span className="font-mono space-x-2">
          {res.variants.map(variant => {
            const dir = (res.file ?? '').includes('/')
              ? (res.file as string).slice(0, (res.file as string).lastIndexOf('/') + 1)
              : '';
            const target = `${dir}${variant}`;
            return (
              <button
                key={variant}
                type="button"
                onClick={event => { event.stopPropagation(); setOpenFile(target); }}
                className="btn-small btn-secondary"
                title={`Open ${target}`}
              >
                {variant}
              </button>
            );
          })}
        </span>
      ),
    },
  ];

  /** The files nothing reads - a table, because a list of 400 paths is not one. */
  /**
   * A door's file, named by the door first: a sysop looking for "the art GWALL
   * draws" knows the door, never the path inside it.
   */
  const doorColumns: DataTableColumn<ScreenFileShape>[] = [
    { id: 'door', header: 'Door', sortable: true, value: item => item.door ?? '',
      cell: item => <span className="text-content-primary">{item.door}</span> },
    {
      id: 'path',
      header: 'File',
      sortable: true,
      value: item => item.relPath,
      cell: item => <span className="font-mono underline">{item.relPath}</span>,
    },
    { id: 'format', header: 'Format', sortable: true, value: item => item.format },
    { id: 'bytes', header: 'Size', align: 'right', sortable: true, value: item => item.bytes,
      cell: item => formatBytes(item.bytes) },
  ];

  /**
   * A plumbing screen, with the codes it runs shown as the reason it holds no
   * art. The count is what tells a sysop whether it is one command or a whole
   * logon sequence.
   */


  const screenTable = (rows: ScreenRow[]) => (
    <DataTable
      columns={columns}
      /*
       * The same rule the gallery uses, so a screen cannot be art in one tab
       * and plumbing in the next. Asked for directly: "so the ansi artists
       * only see the screens they should touch".
       */
      rows={showGenerated ? rows : rows.filter(row => row.hasArt)}
      getRowId={row => row.screen}
      isLoading={isLoading}
      error={error as Error | null}
      onRowClick={(row: ScreenRow) => {
        setOpenScreen(row.screen);
        setOpenFile(null);
      }}
    />
  );

  /**
   * Every screen on the board as a picture.
   *
   * "How can we make it easy for artists to find everything? render mugshots
   * of all screen files?" A designer recognises the art, never the path.
   */
  /** Which format the gallery's thumbnails are drawn in; empty is whatever
   *  each screen resolves to, which is how it behaved before the choice. */
  const buckets = useMemo(() => {
    const all = Object.values(data?.files ?? {});
    return {
      door: all.filter(isDoorArt).sort((a, b) => a.relPath.localeCompare(b.relPath)),
      commands: all.filter(f => !isDoorArt(f) && isCommandsOnly(f))
        .sort((a, b) => a.relPath.localeCompare(b.relPath)),
      notArt: all.filter(f => !isDoorArt(f) && isNotArt(f))
        .sort((a, b) => a.relPath.localeCompare(b.relPath)),
    };
  }, [data]);

  /*
    NO GALLERY AND NO PREVIEW HERE.

    Screen Designer is the gallery - that is its whole view - and previewing a
    theme happens on its status bar, beside the selector that picks one. What
    is left is the sysop's resolution audit: which file each node and each
    conference actually reads for a screen, the variants around it, the share
    planner that points many nodes at one directory, and the art that belongs
    to a door rather than to the board.
  */
  const tabs: TabDefinition[] = [
    {
      id: 'node',
      label: `Node screens ${byScope.node.length}`,
      render: () => screenTable(byScope.node),
    },    {
      id: 'conference',
      label: `Conference screens ${byScope.conf.length}`,
      render: () => screenTable(byScope.conf),
    },    {
      id: 'board',
      label: `Board screens ${byScope.global.length}`,
      render: () => screenTable(byScope.global),
    },    {
      id: 'doors',
      label: `Door screens ${buckets.door.length}`,
      render: () => (
        <div className="space-y-2 text-sm">
          <p className="text-content-secondary">
            Art that belongs to a door, not to the board. A door opens these
            files itself, so none of the board's screen rules reach them: no
            security variants, no per-node or per-conference copies, no
            <span className="font-mono"> .GR </span> routing. Editing one
            changes what that door draws, and nothing else.
          </p>
          <DoorArtList />
          <DataTable
            columns={doorColumns}
            rows={buckets.door.filter(item =>
              !query.trim() || item.relPath.toLowerCase().includes(query.trim().toLowerCase()))}
            getRowId={item => item.relPath}
            initialSort={[{ id: 'door', desc: false }]}
            isLoading={isLoading}
            error={error as Error | null}
            emptyMessage="No installed door ships art of its own."
            onRowClick={item => setOpenFile(item.relPath)}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-2">
        <FileImage size={20} />
        <h1 className="text-xl text-content-primary">Screen Designer</h1>
        <label htmlFor="screen-theme-select" className="label ml-2">Viewing</label>
        <select
          id="screen-theme-select"
          className="input-field"
          value={theme}
          onChange={e => { setTheme(e.target.value); setOpenScreen(null); setOpenFile(null); }}
        >
          <option value="default">The board (default)</option>
          {(themeList?.themes ?? []).filter(t => t.slug !== 'default').map(t => (
            <option key={t.slug} value={t.slug}>{t.title}{t.status !== 'live' ? ` (${t.status})` : ''}</option>
          ))}
        </select>
        {data && (
          <span className="text-sm text-content-secondary">
            {Object.keys(data.files).length} files, {data.unused.length} read by nothing
          </span>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-4">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search screens"
          className="input-field w-full max-w-sm"
        />
        {/*
          Page-wide, not per tab. The filter applies to the gallery AND the
          three screen tables, so a control that lived in the gallery left a
          sysop on the Node tab with rows hidden and no way to say otherwise.
        */}
        <label className="flex items-center gap-2 text-sm text-content-secondary">
          <input
            type="checkbox"
            checked={showGenerated}
            onChange={e => setShowGenerated(e.target.checked)}
          />
          Show plumbing: screens that are only codes, leftovers, and files the
          board writes
        </label>
      </div>

      {/*
        EXPORT, IMPORT AND REPAIR EVERY SCREEN moved to Screen health with the
        reports they belong beside. They are board-wide writes, not something
        done while looking at one picture.
      */}

      {/*
        This page is itself a tab of the Screens workspace, so its own strip
        owns a DIFFERENT key. Sharing `tab` meant clicking any tab here wrote a
        value the workspace strip did not recognise, which sent the workspace
        back to its default and made these tabs impossible to link to.
      */}
      {fileError && (
        <ErrorPanel message={fileError} onRetry={() => setFileError(null)} />
      )}

      <TabbedWorkspace tabs={tabs} param="view" />

      {entry && (
        <section className="space-y-2" ref={detailRef} data-testid="screen-detail">
          <h2 className="text-lg text-content-primary">
            <span className="font-mono">{entry.screen}</span>
            {describeScreen(entry.screen) && (
              <span className="ml-3 text-sm text-content-secondary">
                {describeScreen(entry.screen)}
              </span>
            )}
          </h2>
          <p className="text-sm text-content-secondary">
            Where it resolves from, per node and conference. Edit opens the art;
            the file name opens what the board knows about it.
          </p>

          {/* Generated from express.e, so the claim cites the source this port
              is 1:1 with rather than somebody's memory of AmiExpress. */}
          {callSitesFor(entry.screen).length > 0 && (
            <p className="text-xs text-content-muted">
              Shown by {callSitesFor(entry.screen)
                .map(site => `${site.proc}() - express.e:${site.line}`)
                .join(', ')}
            </p>
          )}

          {/*
            The ROW opens the art. "Make all screens open the edit dialog when
            i click their lines in the table" - so there is no Edit button to
            find, and a scope where nothing resolves has nothing to open.
          */}
          <DataTable
            columns={resolutionColumns}
            rows={entry.resolutions}
            getRowId={res => `${res.scope}-${res.id}`}
            onRowClick={res => {
              if (!res.file) return;
              setFileError(null);
              /*
               * OPENING IS ALL THIS DOES NOW.
               *
               * It used to decide, from the file's format, whether to route
               * into an editor - and the list it decided from is how a .seq
               * row came to open read-only with no way onward ("no editor,
               * just a preview", sysop 2026-09-14). The dialog knows its own
               * formats and says in a sentence what it can do with each, so
               * a caller no longer has to know before it opens.
               */
              setOpenFile(res.file);
            }}
          />

          {entry.duplicateGroups.map(group => (
            <div key={group.sha256} className="text-sm text-content-secondary space-y-1">
              <p className="inline-flex items-center gap-2">
                <Share2 size={14} />
                {group.paths.length} copies with identical content - they can be read from one
                directory instead.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-content-secondary" htmlFor="shared-dir">Share from</label>
                <select
                  id="shared-dir"
                  className="input-field"
                  value={sharedDir}
                  onChange={e => setSharedDir(e.target.value)}
                >
                  {(sharedDirs?.directories ?? []).map(option => (
                    <option key={option.dir} value={option.dir}>
                      {option.dir} ({option.files} screens)
                    </option>
                  ))}
                </select>
                <button
                  className="btn-small btn-secondary"
                  disabled={!sharedDir}
                  onClick={() => previewShare(group.paths)}
                >
                  Check this directory
                </button>
              </div>
            </div>
          ))}

          {shareSummary && (
            <div className="border border-border p-3 text-sm space-y-2">
              <p className="text-content-primary">
                {shareSummary.canShare.length} node
                {shareSummary.canShare.length === 1 ? '' : 's'} can read {sharedDir}.
              </p>
              {shareSummary.blocked.map(node => (
                <p key={node.id} className="text-status-warn">
                  Node {node.id}: {node.reasons.join('; ')}
                </p>
              ))}
              {shareSummary.canShare.length > 0 && (
                <button className="btn-small btn-secondary" onClick={() => applyShare(shareSummary.canShare)}>
                  Point {shareSummary.canShare.length} node
                  {shareSummary.canShare.length === 1 ? '' : 's'} at {sharedDir}
                </button>
              )}
              <button className="btn-small btn-secondary" onClick={() => setShareSummary(null)}>
                cancel
              </button>
            </div>
          )}
        </section>
      )}

      {/*
        ONE DIALOG OVER A SCREEN, and this page used to carry a second.
        `ArtistScreenDialog` already renders the identity, the sentence naming
        what the slot is, and every way forward - and it already takes `sysop`,
        `auditing` and `onSwitchTheme`, because it was built to be the sysop's
        dialog too. This page's own modal answered the same questions by
        different rules: an inspector, a format strip, three editor mounts and
        a fan-out write picker, roughly seven hundred lines of them.

        "two dialogs over the same files, behind two levels of tabs, answering
        the same question by different rules" - the diagnosis in
        thoughts/shared/plans/2026-09-14-screens-one-page-one-dialog-design.md,
        whose step 3 this is.
      */}
      <ArtistScreenDialog
        path={openFile}
        theme={dialogTheme}
        index={data}
        sysop
        onClose={() => setOpenFile(null)}
        onOpenPath={setOpenFile}
        onSwitchTheme={setTheme}
        auditing={theme !== 'default'}
      />



    </div>
  );
}
